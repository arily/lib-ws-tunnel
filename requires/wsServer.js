const server = require('ws').Server;
const wsConnectionContainer = require('./wsConnectionContainer');
const url = require('url');

module.exports = class wsServer {
    constructor(wsConfig, { prefix = '/', proxyServerName = 'Proxy', prefabRoute = [] , proxifier}) {
        if (prefix.substring(prefix.length - 1) == '/') {
            prefix = prefix.substring(0, prefix.length - 1);
        }
        this.prefix = prefix;
        this.name = proxyServerName;
        this.prefabRoute = prefabRoute;
        this.proxifierConfig = proxifier;
        this.server = new server(wsConfig);
        this.connections = new wsConnectionContainer();
        this.newConnection = this.newConnection.bind(this);
        this.parseURL = this.parseURL.bind(this);
        this.server.on('connection', this.newConnection);

    }
    prefab(prefab) {
        this.prefabRoute = prefabRoute;
    }
    newConnection(src, req) {
        try {
            let rawurl = req.url; // like /url:port
            let headers = req.headers;
            let uuid = headers.uuid;
            let url = this.parseURL(rawurl);
            let protocol = url.protocol;
            let port = url.port;
            let addr = url.hostname;
            if (this.connections.isset(uuid) === true) {
                if (this.config.log == true) console.log('uuid exists, recovering socket...');
                let wsTunnel = this.connections.get(uuid);
                wsTunnel.proxifier.srcReconnect(src);
            } else {
                const wsTunnel = require('./wsTunnel');
                this.connections.append(new wsTunnel({ src, protocol, port, addr, req, headers, server: this }));
            }
        } catch (error) {
            console.log(error);
            src.close();
        }
    }
    parseURL(rawurl) {
        rawurl = rawurl.replace(this.prefix, "");
        if (rawurl.substring(rawurl.length - 1) == '/') {
            rawurl = rawurl.substring(0, rawurl.length - 1);
        }
        if (rawurl.substring(0, 1) === '/') {
            rawurl = rawurl.substring(1);
        }
        return new URL(rawurl);
    }
}