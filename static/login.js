(function($) {
    $(function() {
        // check for web storage api
        if(!Util.storageAvailable('sessionStorage') || !Util.storageAvailable('localStorage')) {
            $('section').css('display', 'none');
            $('section.error').css('display', '');
            $('footer').css('display', 'none');
            $('.error .message').html('These reports require a modern web browser (with the web storage API).<br>Any recent version of Chrome, Firefox, Internet Explorer, or Safari should work.');
        } else if(sessionStorage.getItem(Util.tokenKey)) {
            // token already set; not sure if it's better here to re-authenticate or just assume the token's good
            redirect();
        }

        // hook up forms
        $('form.aaf').attr('action', Config.rcshib_url+'?return-path='+Config.baseURL); // TODO Config.baseURL should be run through encodeURIComponent for safety, but that requires changes to rcshibboleth code to work...
        $('form.manual').on('submit', function() { getToken(); return false; });
        var message = sessionStorage.getItem(Util.flashKey);
        if(message) {
            $('.instructions').prepend('<p>'+message+'</p>');
        }
        sessionStorage.removeItem(Util.flashKey);
    });

    var keystone;

    var onAuthenticated = function() {
        // clean up any error messages that might be left over
        $('.manual').removeClass('error');
        $('.manual p.message').html('');

        // save token
        sessionStorage.setItem(Util.tokenKey, keystone.getToken());
        redirect();
    };

    var onError = function(message) {
        $('.manual').addClass('error');
        $('.manual p.message').html(String(message));
    };

    /**
     * please make sure this never throws
     */
    var getToken = function() {
        // remove any error display (actually redundant, since if token gets obtained the browser redirects anyway)
        $('.manual').removeClass('error');
        $('.manual p.message').html('');

        var magic = 'a';
        if($('#username').val() === magic) {
            keystone = {getToken : function() { return magic; }};
            onAuthenticated();
        } else {
            onError('Unauthorised');
        }

        /* this code should be used again once authentication actually works...
         * like now, hopefully */
        // constructing Keystone instance can throw (e.g. on empty authURL); need to catch that here
        try {
            keystone = new osclient.Keystone({
                authURL       : $('#url').val(),
                domainName    : 'default',
                username      : $('#username').val(),
                password      : $('#password').val(),
            });
            keystone.defaultParams.error = function(jqxhr, status, err) {
                onError(err);
            };
        } catch(exception) {
            onError(exception);
            return; // don't bother trying to authenticate if something has already failed
        }
        keystone.authenticate().then(
            onAuthenticated,
            function(error) {
                onError(error);
            }
        );
        /**/
    };

    var redirect = function() {
        location.replace(Config.baseURL + Util.reports[0].url);
    };
})(jQuery);
