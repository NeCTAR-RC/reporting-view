// idk if this is a silly design but it was the least bad that sprung to mind...
// will eventually want to add some kind of abstraction for virtual endpoints, in order to define 'All nodes' endpoint with aggregation which would be defined per report
var Config = {
    baseURL : 'http://example.com/',
    tokenKey : 'token', // key in sessionStorage for keystone token
    flashKey : 'flash', // key in sessionStorage for temporary message storage
    endpointKey : 'endpoint', // key in localStorage for which endpoint to use (identified by url)
    endpoints : [
        {
            name : 'Testjin',
            url  : 'http://130.56.247.248:9494',
        },
        {
            name : 'Tenjin',
            url  : 'http://130.56.247.245:9494',
        },
    ],
    reports : [
        {
            name : 'Load',
            url  : '/load/',
        },
        {
            name : 'Project',
            url  : '/project/',
        },
        {
            name : 'Flavours',
            url  : '/flav/',
        },
        {
            name : 'Billing',
            url  : '/billing/',
        },
    ],
};