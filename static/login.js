var Login = {};
(function($) {
    $(function() {
        // check for web storage api
        if(!Util.storageAvailable('sessionStorage') || !Util.storageAvailable('localStorage')) {
            Login.error('Unsupported browser', 'These reports require a modern web browser (with the web storage API).<br>Any recent version of Chrome, Firefox, Internet Explorer, or Safari should work.');
        } else if(sessionStorage.getItem(Util.tokenKey)) {
            // token already set; not sure if it's better here to re-authenticate or just assume the token's good
            Login.redirect();
        }

        // hook up form
        $('form.aaf').attr('action', Config.rcshib_url+'?return-path='+Config.baseURL); // TODO Config.baseURL should be run through encodeURIComponent for safety, but that requires changes to rcshibboleth code to work...
        var message = sessionStorage.getItem(Util.flashKey);
        if(message) {
            $('.instructions').prepend('<p>'+message+'</p>');
        }
        sessionStorage.removeItem(Util.flashKey);
    });

    Login.redirect = function() {
        location.replace(Config.baseURL + Util.reports[0].url);
    };

    Login.error = function(title, description) {
        console.log('Error :: '+title+' :: '+description);
        $('section').css('display', 'none');
        $('footer').css('display', 'none');
        $('section.error').css('display', '');
        $('section.error .title').html(title);
        $('.error .message').html(description);
    };
})(jQuery);
