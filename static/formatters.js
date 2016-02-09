var Formatters = {};

(function() {
    Formatters.relativeDateDisplay = function(date) {
        var t = Date.parse(date);
        if(isNaN(t)) return '';
        return '<span title="'+(new Date(date))+'">'+humanize.relativeTime(t*1e-3)+'</span>';
    };

    Formatters.flavourDisplay = function(flavours) {
        return function(flavour_id) {
            var f = flavours.find(function(f){return f.id==flavour_id;});
            return '<abbr title="'+f.vcpus+' cpu / '+
                                  Formatters.si_bytes(f.memory*1024*1024)+' / '+
                                  Formatters.si_bytes((+f.root+(+f.ephemeral))*1024*1024*1024)+
                   '">'+f.name+'</abbr>';
        };
    };

    Formatters.timeDisplay = function(secss) {
        var secs = +secss, days = Math.floor(secs/86400); // nobody likes leap seconds
        if(secs < 60) return secs + ' seconds';
        return '<span title="'+
               (days >= 2 ? days+' days' : Math.floor(secs/3600)+' hours')+'">'+
               humanize.relativeTime( humanize.time() + secs).replace('in ', '')+
               '</span>';
    };

    Formatters.si_bytes = function(bytes, decimals) {
        var d = decimals || 0;
        return humanize.intword(
            bytes, ['bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'],
            1024, // using binary units
            d,    // decimal places
            '.',  // decimal point
            '',   // no thousands sep
            ' '   // suffix sep
        );
    };
})();
