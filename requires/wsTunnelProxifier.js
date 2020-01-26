module.exports = class wsTunnelProxifier {
    report_status(chain) {
        let id = chain.srcID;
        const status = (status) => {
            switch (status) {
                case 0:
                    return '<-x->';
                case 1:
                    return '<--->';
                case -1:
                    return '<-S->';
                default:
                    return '<-?->';
            }
        }
        let str_left = status(chain.srcConnection);
        let str_right = status(chain.dstConnection);
        let localaddr = (chain.localAddress !== undefined) ? ' | '.concat(chain.localAddress) : '(x.x.x.x)';
        let localport = (chain.localPort !== undefined) ? chain.localPort : 'xxxxx';
        let server_connection = chain.serverName.concat(localaddr, ':', localport);
        let dst = chain.dstAddr.concat(':', chain.dstPort);
        if (!chain.srcConnection) {
            id = '00000000-0000';
        }
        if (!chain.dstConnection) {
            dst = 'detached';
        }
        if (report === true) {
            console.log(id, str_left, server_connection, str_right, dst);
        }
    };

    constructor({ src, dst, addr, req, functionName, chain, container, type = 'tcp', port = undefined }, config = {
        reconnectWindow: 5000,
        reconnectEnabled: true
    }) {
        this.src = src;
        this.dst = dst;
        this.addr = addr;
        this.req = req;
        this.functionName = functionName;
        this.chain = chain;
        this.container = container;
        this.port = port;
        this.config = require('../config/wstunnel').Proxifier;

        dst.on('error', (e) => {
            this.closeDst();
        });
        src.on('error', e => {
            this.closeSrc(1001);
        })
        //tcp
        if (type === 'tcp') {
            dst.on('connect', () => {
                this.chain.dstSentBytes = this.chain.srcSentBytes = 0;
                this.chain.dstConnection = 1;
                this.chain.localPort = dst.localPort;
                this.chain.localAddress = dst.localAddress;
                this.report_status(this.chain);
            });
        } else if (type === 'udp') {
            dst.on('listening', () => {
                this.chain.dstSentBytes = this.chain.srcSentBytes = 0;
                this.chain.dstConnection = 1;
                this.chain.localPort = dst.address().port;
                this.chain.localAddress = dst.address().address;
                this.chain.dstConnection = 1;
                this.report_status(this.chain);
            });
        }

        src.on('close', (e) => {
            this.srcOnClose(e);
        })
        dst.on('close', (e) => {
            this.dstOnClose(e);
        });

        this.wsKeepalive();
        this.tunnel();

    }
    getSrc() {
        return this.src;
    }
    getDst() {
        return this.dst;
    }
    suspend(socket, timeOut) {
        socket.pause();
        this.chain.dstConnection = -1;
        this.abortTimeout = setTimeout(() => {
            this.closeDst();
            this.chain.dstConnection = 0;
            this.container.destroy(this.chain.srcID);
        }, timeOut);
        this.report_status(this.chain);
    }
    resume(socket) {
        this.chain.dstConnection = 1;
        clearTimeout(this.abortTimeout);
        socket.resume();
        this.report_status(this.chain);
        this.src.on(`${this.srcOnMessageEventName}`, (data) => {

            this.dst[`${this.dstSendMethodName}`](data);
        });
        this.src.on('close', (e) => {
            this.srcOnClose(e);
        });
    }
    srcReconnect(src) {
        this.src.terminate();
        delete this.src;
        this.src = src;
        this.chain.srcConnection = 1;
        this.resume(this.dst);
    }
    tunnel() {
        this.src.removeListener(`${this.functionName.srcOnMessageEvent}`, () => {});
        this.dst.removeListener(`${this.functionName.dstOnMessageEvent}`, () => {});
        this.src.on(`${this.functionName.srcOnMessageEvent}`, (data) => {
            this.dst[`${this.functionName.dstSendMethod}`](data, this.port);
            this.chain.dstSentBytes += data.byteLength;
        });
        this.dst.on(`${this.functionName.dstOnMessageEvent}`, (data) => {
            this.src[`${this.functionName.srcSendMethod}`](data);
            this.chain.srcSentBytes += data.byteLength;
        });
    }
    wsKeepalive() {
        this.src.on('pong', () => {
            let f = () => {};
            this.alive('src');
            this.srcTimeoutInterval = setInterval(() => {
                this.connectionInterrupted('src');
            }, 5000);
            this.srcPingInterval = setInterval(() => {
                this.src.ping(f);
            }, 3000);
        });
    }
    connectionInterrupted(socket) {
        if (socket === 'src') {
            this.srcOnClose(1001);
        }
    }
    alive(socket) {
        if (socket === 'src') {
            this.chain.srcConnection = 1;
        } else if (socket === 'dst') {
            this.chain.dstConnection = 1;
        }
    }
    srcOnClose(e) {
        this.chain.srcConnection = 0;
        this.report_status(this.chain);
        if (e === 1001) {
            this.suspend(this.dst, this.config.reconnectWindow);
        } else {
            if (this.chain.dstConnection === 1) {
                this.closeDst(e);
            }
            this.container.destroy(this.chain.srcID);
        }
    }
    dstOnClose(e) {
        this.chain.dstConnection = 0;
        this.closeSrc(1000);
        this.report_status(this.chain);
    }
    closeSrc(e = 1000) {
        this.src[`${this.functionName.srcClose}`](e);
    }
    closeDst(e = 1000) {

        this.dst[`${this.functionName.dstClose}`]();
    }
}