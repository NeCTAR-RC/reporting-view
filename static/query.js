var Report = {};
(function() {

/// event broadcasting
var dispatch = d3.dispatch('flavChanged');

Report.init = function() {
    Util.initReport([
        {
            sel : '.controls',
            dep : ['metadata'],
            fun : report_reports,
        },
    ]);
};

function report_reports(sel, g) {
    var metadata = g.metadata;

    var $s = d3.select(sel);
    var $submit = $s.select('input[type=submit]');
    var $state = $s.select('.state');
    var $filters = $s.select('.filters');
    var $select = $s.select('select#report');
    var $uri = $s.select('.uri');

    var state = {
        filters: [{k: '', v: ''}],  // list of {k: 'column name', v: 'value'}
        mode: 'ready',  // one of {'ready', 'fetching', 'error'}
        table: metadata.length ? metadata[2] : null,  // selected element of metadata
        data: [],  // query result
    };

    var getFilterQuery = function() {
        var s = state.filters
          .filter(function(f) {
              return f.k.length > 0;  // can't filter if no key is provided
          })
          .map(function(f) {
              return encodeURIComponent(f.k) + '=' + encodeURIComponent(f.v);
          })
          .join('&');
        return s ? '?' + s : '';
    };

    // initialise <select>
    var $opt = $select.selectAll('option').data(metadata);
    $opt.enter().append('option');
    $opt.exit().remove();
    $opt
        .attr('value', function(m) { return m.table_name; })
        .text(function(m) { return m.table_name; });

    // bind static event handlers
    $select.on('change', function() {
        var name = this.value;
        state.table = metadata.find(function(m) { return m.table_name === name; }) || null;
        render();
    });
    $s.select('.filteradd').on('click', function() {
        state.filters.push({k:'', v:''});
        render();
    });

    // (re)draw everything
    var render = function() {
        $opt.attr('selected', function(d) { return d === state.table ? '' : null; });
        $s.select('.row_count').text(state.table.row_count);
        $s.select('.last_update').html(Formatters.relativeDateDisplay(new Date(state.table.last_update)));
        $uri.text('GET /v1/reports/' + state.table.table_name + getFilterQuery());

        var $filter = $filters.selectAll('div.row').data(state.filters);
        var $filterEnter = $filter.enter()
          .append('div')
            .attr('class', 'row');
        $filterEnter
          .append('div')
            .attr('class', 'five columns')
          .append('input')
            .attr('type', 'text')
            .attr('class', 'u-full-width filterkey')
            .attr('placeholder', 'fieldname');
        $filterEnter
          .append('div')
            .attr('class', 'five columns')
          .append('input')
            .attr('type', 'text')
            .attr('class', 'u-full-width filtervalue')
            .attr('placeholder', 'value');
        $filterEnter
          .append('div')
            .attr('class', 'one columns')
          .append('input')
            .attr('type', 'button')
            .attr('class', 'u-full-width filterremove')
            .attr('value', '-');

        $filter.exit().remove();
        $filter.select('input.filterkey')
          .attr('value', function(d) { return d.k; })
          .on('change', function(d) { d.k = this.value; render(); });
        $filter.select('input.filtervalue')
          .attr('value', function(d) { return d.v; })
          .on('change', function(d) { d.v = this.value; render(); });
        $filter.select('input.filterremove')
          .on('click', function(d, i) { state.filters.splice(i, 1); render(); });

        if(state.mode === 'ready') {
            $state.classed('loading', false);
            $state.classed('error', false);
            $state.html('&nbsp;');  // to prevent collapse
            $submit.on('click', fetch);
            $submit.attr('value', 'Fetch Data');
        } else if(state.mode === 'fetching') {
            $state.classed('loading', true);
            $state.classed('error', false);
            $state.html('&nbsp;');
            $submit.on('click', cancel);
            $submit.attr('value', 'Cancel');
        } else {
            $state.classed('loading', false);
            $state.classed('error', true);
            $state.text('An error occurred.');  // FIXME Fetcher should propagate errors
            $submit.on('click', fetch);
            $submit.attr('value', 'Fetch Data');
        }

        if(state.data.length) {
            var blob = new Blob([JSON.stringify(state.data)], {type: 'application/json;charset=utf-8'});
            saveAs(blob, state.table.table_name + '.json');
        }
    };

    // callback gets defined after Fetcher is initialised
    var cancel = null;

    // callback to start fetching data
    var fetch = function() {
        var f = Util.fetcher();
        cancel = function() {
            f.abort();
            state.data = [];  // this is probably unnecessary, since only one table is being fetched so there's no possibility for inconsistent state, but it doesn't hurt anyway..
            state.mode = 'ready';
            render();
        };

        f.q({
            qks     : [state.table.table_name + getFilterQuery()],
            start   : function()     { state.data = []; state.mode = 'fetching'; render(); },
            success : function(data) { state.data = data[state.table.table_name + getFilterQuery()]; state.mode = 'ready'; render(); },
            error   : function()     { state.data = []; state.mode = 'error'; render(); },
        })();
    };

    render();
}

})();
