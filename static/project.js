var Project = {};
(function() {

Project.init = function() {
    // fetch data for report
    Util.initReport([
        {
            sel : '.report',
            dep : ['project?personal=0&has_instances=1', 'flavour'],
            fun : report,
        },
    ], {
        sel : 'footer',
        dep : ['metadata'],
        fun : footer,
    });
};

var resources = [
    {
        key      : 'vcpus', // to identify and to access data
        label    : 'VCPUs', // for pretty printing
        format   : d3.format('d'),
        quota    : function(project) { return project.quota_vcpus; }, // if specified, causes "quota exceeded" warnings will be shown
        instance : function(instance) { return instance.vcpus; }, // if specified, sum(instance) with this accessor will be shown in line chart
        //volume : if specified, sum(volume) with this accessor will be added to sum(instance) and shown in line chart
    },
    {
        key      : 'memory',
        label    : 'Memory',
        format   : function(mb) { return Formatters.si_bytes(mb*1024*1024); },
        quota    : function(project) { return project.quota_memory; },
        instance : function(instance) { return instance.memory; },
    },
    {
        key      : 'ephemeral',
        label    : 'Ephemeral storage',
        format   : function(gb) { return Formatters.si_bytes(gb*1024*1024*1024); },
        instance : function(instance) { return instance.ephemeral; },
    },
    {
        key      : 'volume',
        label    : 'Volume storage',
        format   : function(gb) { return Formatters.si_bytes(gb*1024*1024*1024); },
        volume   : function(volume) { return volume.size; },
        quota    : function(project) { return project.quota_volume_total; },
    },
];

var report = function(sel, data) {
    // relabel for convenience
    var s = d3.select(sel);
    var warn = s.select('.warning');
    var project = data['project?personal=0&has_instances=1'];
    var flavour = data.flavour;
    var az = localStorage.getItem(Util.nodeKey);

    // extract project ids, organisations, and display names, and sort
    project = project
        .filter(function(p) { return p.has_instances; })
        .map(function(d) { return {id:d.id, display_name:d.display_name, organisation:d.organisation}; })
        .sort(function(a, b) { return d3.ascending(a.display_name.toLowerCase(), b.display_name.toLowerCase()); });

    // generate project <select>
    var projSelect = s.select('select#project');
    var projectOpt = projSelect.selectAll('option')
        .data(project);
    projectOpt.enter().append('option');
    projectOpt
        .attr('value', function(d) { return d.id; })
        .text(function(d) { return d.display_name; });
    projectOpt.exit().remove();

    // gather institutions
    var inst = {}; // this will be {'Institution Name' : [pid1, pid2, ..]} (since the organisation name seems to be the only identifier for the institution, there's no id field)
    project.forEach(function(p) {
        if(!p.organisation) return; // don't try calling null.split
        p.organisation.split(';').forEach(function(o) {
            if(!inst[o]) inst[o] = [];
            inst[o].push(p.id);
        });
    });
    var organisation = Object.keys(inst).sort(); // make an array, for calling selection.data

    // generate institution <select>
    var instSelect = s.select('select#institution');
    var instOpt = instSelect.selectAll('option')
        .data(organisation);
    instOpt.enter().append('option');
    instOpt
        .attr('value', function(d) { return d; })
        .text(function(d) { return d; });
    instOpt.exit().remove();

    // keep in sync radio, select and label elements
    var picked = function(d, i) {
        radio.property('checked', function(dr, ir) { return ir === i; });
        s.selectAll('.controls > div').classed('disabled', function(_, is) { return 1-is === i; });
        update();
    };
    var radio = s.selectAll('input[type=radio]');
    radio.property('checked', function(d, i) { return i === 0; });
    radio.on('change', picked);
    s.selectAll('.controls > div').classed('disabled', function(_, i) { return i === 1; });
    s.selectAll('label[for=project],label[for=institution]').on('click', picked);
    s.selectAll('#project,#institution').on('change', picked);

    // generate resource <select>
    var resSelect = s.select('select#resource');
    var resOpt = resSelect.selectAll('option')
        .data(resources);
    resOpt.enter().append('option');
    resOpt
        .attr('value', function(d) { return d.key; })
        .text(function(d) { return d.label; });
    resOpt.exit().remove();

    // initialise line chart
    var chart = Charts.zoom()
        .xFn(function(d) { return d.x; })
        .yDateFn(function(d) { return d.y; })
        .yZoom(function(d) { return d.y; });
    chart.tip().html(function(d) { return d.label; });

    var progress = Charts.progress();
    var progressContainer = s.select('.progress');

    // there can be quite a lot of data to fetch, and impatient users may
    // submit multiple simultaneous requests if the ui does not block to
    // prevent it
    var blockUI = function() {
        s.classed('loading', true);
        s.style('cursor', 'wait');
        s.selectAll('input,select').attr('disabled', 'disabled');
        s.select('.cancel').style('display',null);

        // these only get re-shown when all data have been fetched
        // (not in unblockUI, since that gets called by "cancel" too)
        s.select('.historical').style('display', 'none');
        s.select('.table').style('display', 'none');
    };
    var unblockUI = function() {
        s.classed('loading', false);
        s.style('cursor', null);
        s.selectAll('input,select').attr('disabled', null);
        s.select('.cancel').style('display','none');
        progressContainer.style('display', 'none');
    };

    // called when a different project/institution is selected
    var update = function() {
        blockUI();
        // create list of projects whose data should be fetched
        var pids;
        if(s.select('label[for=institution] input[type=radio]').property('checked')) {
            pids = inst[instSelect.property('value')];
        } else {
            // picking a single project: make array with length 1
            var pid = projSelect.property('value');
            pids = [pid];

            // if there's an organisation associated with this project, select it
            var o = organisation.find(function(o) {
                return inst[o].find(function(p) {
                    return p === pid;
                }) !== undefined;
            });
            if(o) {
                // found matching organisation
                instSelect.property('value', o);
            }
        }

        // re-bind handler for availability zone change
        // note that this removes the default (util.js) handler,
        // which is what we want in this particular report
        // because there's no need to re-call report()
        // (and consequently reset UI state) -- just need to
        // re-call fetchedAll.
        // n.b. I ran into trouble trying to avoid this overriding:
        // doing .on('change.foo', ...) had no effect.
        // But then I realised that actually I wanted to remove
        // the default behaviour anyway, so whatever... :\
        d3.selectAll('#az select').on('change', function() {
            localStorage.setItem(Util.nodeKey, this.value); // TODO this should really be refactored (DRY, cf util.js); add Util.on dispatch object and have each report specify how it should respond to az change
            az = this.value;
            fetchedAll();
        });

        // fetch and combine all data for given projects
        var callbacks = function(pid, callback) {
            return {
                success : function(data) {
                    callback(pid, data);
                },
                error : function() {
                    // any error fetching data is treated as fatal
                    // alternatively we could try to carry on, using just whatever is successfully received,
                    // but this would require carefully checking any joining code to make sure it handles missing data gracefully
                    warn.style('display',null);
                    warn.append('p').html('Fatal error getting data for project id '+pid+'.');
                    progressContainer.style('display', 'none');
                },
            };
        };
        var projectAgg = [], instanceAgg = [], volumeAgg = [], activeResources; // aggregated data
        var n = 0; // count of how many projects have had data received
        var fetched = function(pid, data) { // called after fetching individual project's data;
            // combine all fetched data
            projectAgg  = projectAgg.concat(data['project?id='+pid]);
            instanceAgg = instanceAgg.concat(data['instance?project_id='+pid]);
            volumeAgg   = volumeAgg.concat(data['volume?project_id='+pid]);

            // show progress and check if we're finished
            progressContainer.call(progress.val(++n));
            if(n === pids.length) {
                progressContainer.style('display', 'none');
                fetchedAll();
            }
        };
        var fetchedAll = function() { // called after fetching all projects' data, aggregated in project and instance
            unblockUI();
            s.select('.historical').style('display', null);
            s.select('.table').style('display', null);

            // filter by availability_zone
            var instance = instanceAgg.filter(function(ins) {
                if(!ins.availability_zone) {
                    // ignore (presumably unscheduled) instances with no AZ
                    console.log('Warning: missing availability_zone data for instance', ins.id);
                    return false;
                }
                return Util.matchAZ(ins.availability_zone);
            });
            var volume = volumeAgg.filter(function(v) { return v.availability_zone.indexOf(az) === 0; });
            var project = projectAgg.filter(function() { return true; });

            // fill activeResources, array of {
            //  pid    : project id,
            //  label  : for pretty printing,
            //  vcpus  : total over active instances and volumes
            //  memory : total over active instances and volumes
            //  etc    : for other elements of resources arrray
            // }
            var activeInstance  = instance.filter(function(i) { return i.active; });
            var activeVolume    = volume.filter(function(v) { return v.active; });
            activeResources = pids.map(function(pid) {
                var ret = {pid : pid, label : project.find(function(p) { return p.id === pid; }).display_name};
                resources.forEach(function(r) {
                    // TODO would it be better to store the aggregated data by project_id, to avoid filtering here
                    ret[r.key] = 0;
                    if(r.instance) ret[r.key] += d3.sum(activeInstance.filter(function(i) { return i.project_id === pid; }), r.instance);
                    if(r.volume) ret[r.key] += d3.sum(activeVolume.filter(function(v) { return v.project_id === pid; }), r.volume);
                });
                return ret;
            });

            // sort by first resource (vcpus)
            activeResources.sort(function(a, b) { return b[resources[0].key] - a[resources[0].key]; });

            // prepend "Unused" element
            var warnings = []; // also keep track of any quotas exceeded
            if(az === '') {
                var unused = {pid:null, label:'Unused'};
                resources.forEach(function(r) {
                    unused[r.key] = null; // chart breaks if keys are missing, but works with null values
                    if(r.quota) { // if quota function is defined for this resource, sum over all projects
                        if(project.some(function(p) { return r.quota(p) < 0; })) {
                            // some project has unlimited quota (quota=-1), so "unused" segment cannot be drawn
                            return;
                        }
                        var quota = d3.sum(project, r.quota);
                        var used = d3.sum(activeResources, function(ar) { return ar[r.key]; });
                        if(used > quota) {
                            // some project has gone over quota...
                            warnings.push('Quota exceeded for '+r.key+' ('+pids.map(function(pid) { return project.find(function(p) { return p.id === pid; }).display_name; }).join(', ')+').');
                        } else {
                            unused[r.key] = quota - used;
                        }
                    }
                });
                activeResources.unshift(unused);
            }

            // display any quota warnings
            warn.style('display', warnings.length > 0 ? null : 'none');
            var w = warn.selectAll('p').data(warnings);
            w.enter().append('p');
            w.html(String);
            w.exit().remove();

            // fill data, array of {
            //  key    : resource.label
            //  values : [{x, y, label}]
            // }
            // i.e. the format expected by nvd3 lineWithFocusChart,
            // even though we're not using lineWithFocusChart
            // (because it doesn't let you zoom/pan arbitrarily, making it not possible
            // in general to view monthly/quarterly/etc. usage)
            var data = resources.map(function(r) { return {key : r.label, values : []}; });

            // compile list of all instance/volume creation/deletion events
            var events = [];
            var nt = Date.now();
            instance.forEach(function(i) {
                var ct = Date.parse(i.created),
                    dt = Date.parse(i.deleted);
                i._c_time = ct; // store these for filtering later
                i._d_time = dt; // (to avoid recomputing for every row)
                i._w_time = ((isNaN(dt) ? nt : dt) - ct) * 0.001; // convert ms to s for walltime
                if(!isNaN(ct)) events.push({time:ct, mult:+1, instance:i});
                if(!isNaN(dt)) events.push({time:dt, mult:-1, instance:i});
            });
            volume.forEach(function(v) {
                var ct = Date.parse(v.created),
                    dt = Date.parse(v.deleted);
                v._c_time = ct;                                   // D
                v._d_time = dt;                                   // R
                v._w_time = ((isNaN(dt) ? nt : dt) - ct) * 0.001; // Y
                if(!isNaN(ct)) events.push({time:ct, mult:+1, volume:v});
                if(!isNaN(dt)) events.push({time:dt, mult:-1, volume:v});
            });
            events.sort(function(e1, e2) { return e1.time - e2.time; });

            // precompute indices into data/resources arrays of resources with instance/volume accessors
            var insIdx = resources.filter(function(r) { return r.instance; }).map(function(r) { return data.findIndex(function(d) { return d.key === r.label; }); });
            var volIdx = resources.filter(function(r) { return r.volume; }).map(function(r) { return data.findIndex(function(d) { return d.key === r.label; }); });

            var verb = {}; verb[+1] = 'created'; verb[-1] = 'deleted';
            events.forEach(function(e) {
                // n.b. if a resource is defined with both instance and volume accessors,
                // then this will add two data points with same x value
                if(e.instance) {
                    insIdx.forEach(function(i) {
                        var yOld = data[i].values.length ? data[i].values[data[i].values.length-1].y : 0;
                        data[i].values.push({
                            x     : e.time,
                            y     : yOld+e.mult*resources[i].instance(e.instance),
                            label : verb[e.mult]+' '+e.instance.name,
                        });
                    });
                }
                if(e.volume) {
                    volIdx.forEach(function(i) {
                        var yOld = data[i].values.length ? data[i].values[data[i].values.length-1].y : 0;
                        data[i].values.push({
                            x     : e.time,
                            y     : yOld+e.mult*resources[i].volume(e.volume),
                            label : verb[e.mult]+' '+e.volume.display_name,
                        });
                    });
                }
            });

            // initialise date selectors
            if(!report.startPicker) {
                var startSelected = function(date) {
                    report.endPicker.setMinDate(date);
                    chart.dispatch.zoom([date, report.endPicker.getDate()]);
                };
                var endSelected = function(date) {
                    report.startPicker.setMaxDate(date);
                    // date range for integration is semi-open interval [start, end)
                    // so we're technically missing 1 millisecond here...
                    var endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
                    chart.dispatch.zoom([report.startPicker.getDate(), endOfDay]);
                };
                report.startPicker = new Pikaday({
                    field : document.getElementById('start'),
                    defaultDate : new Date(events[0].time),
                    setDefaultDate : true,
                    onSelect : startSelected,
                });
                report.endPicker = new Pikaday({
                    field : document.getElementById('end'),
                    defaultDate : new Date(),
                    setDefaultDate : true,
                    onSelect : endSelected,
                });
            }

            // append "now" data points (hack to make the graphs a bit more readable; doesn't add any extra information)
            var now = Date.now();
            data.forEach(function(d) {
                if(d.values.length > 0) {
                    var latest = d.values[d.values.length-1].y;
                    d.values.push({x:now, y:latest, label:'now'});
                }
            });

            // data now ready for plotting
            var updateCharts = function() {
                var idx = resSelect.property('selectedIndex');

                // if selected resource is volumes, list volumes; otherwise, list instances
                var listVolumes = resources[idx].key == 'volume';

                // set up DataTable
                var sTable = $('table', $(sel));
                if($.fn.dataTable.isDataTable(sTable)) {
                    // cannot re-initialise DataTable; have to delete it and start again
                    sTable.DataTable().clear().destroy();
                    sTable.empty(); // clear out leftover data stored in dom by DataTables
                }
                var dTable = sTable.DataTable({
                    dom : 'Bfrtip', // reference: https://datatables.net/reference/option/dom
                    data : listVolumes ? volume : instance,
                    processing : true,
                    paging : true,
                    deferRender : true,
                    columns : [
                        {
                            title : 'Name',
                            data : listVolumes ? 'display_name' : 'name',
                        },
                        {
                            title : 'Created',
                            data : 'created',
                            className : 'date',
                            render : {
                                display : Formatters.relativeDateDisplay,
                            },
                        },
                        {
                            title : 'Deleted',
                            data : 'deleted',
                            className : 'date',
                            render : {
                                display : Formatters.relativeDateDisplay,
                            },
                        },
                        {
                            title : 'Project',
                            data : function(ins) {
                                return project.find(function(p){return p.id===ins.project_id;}).display_name;
                            },
                        },
                        {
                            title : 'Availability zone',
                            data : function(ins) {
                                return ins.availability_zone;
                            },
                        },
                        {
                            title : 'Walltime',
                            className : 'walltime',
                            data : '_w_time',
                            render : { display : Formatters.hoursDisplay },
                        },
                        {
                            title : 'Project ID',
                            data : 'project_id',
                            className : 'project_id', // to identify column for filtering
                            visible : false,
                        },
                        {
                            title : 'ID',
                            data : 'id',
                            visible : false,
                        },
                    ].concat(listVolumes ? [ // extra columns when listing volumes:
                        {
                            title : 'Size',
                            data : 'size',
                            render : {
                                display : function(gb) { return Formatters.si_bytes(gb*1024*1024*1024); },
                            },
                        }
                    ] : [ // extra columns when when listing instances:
                        {
                            title : 'Flavour',
                            data : 'flavour',
                            render : {
                                _ : Formatters.flavourDisplay(flavour),
                                filter : function(fid) { return flavour.find(function(f){return f.id===fid;}).name; },
                            },
                        },
                        {
                            title : 'Flavour.vcpus',
                            data : 'flavour',
                            render : {
                                _ : function(fid) { return flavour.find(function(f){return f.id===fid;}).vcpus; },
                            },
                            searchable : false,
                            visible : false,
                        },
                        {
                            title : 'Flavour.memory_mb',
                            data : 'flavour',
                            render : {
                                _ : function(fid) { return flavour.find(function(f){return f.id===fid;}).memory; },
                            },
                            searchable : false,
                            visible : false,
                        },
                        {
                            title : 'Flavour.disk_gb',
                            data : 'flavour',
                            render : {
                                _ : function(fid) { var f = flavour.find(function(f){return f.id===fid;}); return f.root+f.ephemeral; },
                            },
                            searchable : false,
                            visible : false,
                        },
                        {
                            title : 'Core hours',
                            data : function(row) { return row.vcpus*row._w_time/3600.0; },
                            searchable : false,
                            visible : false,
                        },
                    ]),
                    order : [[1, 'desc']], // order by second col: most recently created first
                    language : {
                        zeroRecords : 'No matching '+(listVolumes ? 'volumes':'instances')+' found.',
                    },
                    buttons : [
                        {
                            extend : 'csv',
                            text : 'Download CSV',
                            exportOptions : {
                                orthogonal : 'export',
                            }
                        }
                    ],
                });

                // add extra event handler for chart zoom, to keep data table synchronised
                chart.dispatch.on('zoom.project', function(extent) {
                    // remove existing filter functions
                    var nf = $.fn.dataTable.ext.search.length;
                    for(var j=0; j<nf; j++) {
                        $.fn.dataTable.ext.search.pop();
                    }

                    if(extent) {
                        // add new filter to show only instances within extent
                        var e0 = extent[0].getTime(), // extract numeric values
                            e1 = extent[1].getTime(); // of dates
                        $.fn.dataTable.ext.search.push(function(settings, data, dataIndex, instance) {
                            // don't show instance if it was deleted before the time interval, or created after
                            return !(instance._d_time < e0 || instance._c_time > e1);
                        });
                    }

                    // ensure that extent is defined
                    if(!extent) {
                        // "now" is as out of date as fetched data; using "new Date()" could be misleading
                        extent = [new Date(events[0].time), new Date(now)];
                    }

                    // update date selectors; second param prevents onSelect callback, avoiding infinite loop
                    report.startPicker.setDate(extent[0], true);
                    report.endPicker.setDate(extent[1], true);

                    // update chart data _w_time
                    var data = dTable.data();
                    for(var i=0; i<data.length; i++) {
                        var start = Math.max(extent[0].getTime(), data[i]._c_time);
                        var end = Math.min(extent[1].getTime(), isNaN(data[i]._d_time) ? nt : data[i]._d_time);
                        data[i]._w_time = (end - start) * 0.001; // convert ms to s for walltime
                    }
                    window.data = data;

                    // apply new filters by redrawing
                    dTable.rows().invalidate();
                    dTable.draw();
                });

                // tick format may have changed if viewing a different resource
                chart.tickFormat(resources[idx].format);
                s.select('.chart').datum(data[idx].values).call(chart);
                chart.dispatch.zoom(null); // reset zoom
            };

            resSelect.on('change.line', updateCharts);
            updateCharts();
        };

        // reset and display progress indicator
        progress
            .max(pids.length)
            .val(0);
        progressContainer
            .style('display', null)
            .call(progress);

        // enqueue all data to be fetched
        var fetch = Util.fetcher();
        pids.forEach(function(pid) {
            var on = callbacks(pid, fetched);
            fetch.q({
                qks     : ['project?id='+pid, 'instance?project_id='+pid, 'volume?project_id='+pid],
                start   : on.start,
                success : on.success,
                error   : on.error,
            });
        });
        s.select('.cancel button').on('click', function() {
            fetch.abort();
            unblockUI();
        });
        fetch();
    };
    update();
};

var footer = function(sel, data) {
    // we only care about updates of tables listed in "data", not all tables in the database
    var tables = Object.keys(data).map(function(qk) {
        var i = qk.indexOf('?'); // remove any query parameters from table names
        return i === -1 ? qk : qk.substring(0, i);
    });
    var md = data.metadata.filter(function(m) { return tables.indexOf(m.table_name) >= 0; });

    // convert oldest timestamp from milliseconds to seconds
    var t = d3.min(md, function(m) { return Date.parse(m.last_update); }) * 0.001;

    // pretty print
    d3.select(sel).select('.date').text(humanize.relativeTime(t));
};

})();
