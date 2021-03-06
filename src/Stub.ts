/// <reference path="Protocol.config.ts" />

/// <reference path="Util.class.ts" />



/** @ignore */
module Eureca {

    // Class
    export class Stub {

        private callbacks: any;
        // Constructor
        constructor(public settings: any = {}) {
            this.callbacks = {};
        }

        registerCallBack(sig, cb) {
            this.callbacks[sig] = cb;
        }

        doCallBack(sig, result, error) {
            if (!sig) return;
            var proxyObj = this.callbacks[sig];
            delete this.callbacks[sig];

            if (proxyObj !== undefined) {
                proxyObj.status = 1;
                proxyObj.result = result;
                proxyObj.error = error;

                if (error == null)
                    proxyObj.callback(result);
                else
                    proxyObj.errorCallback(error);
            }
        }

        /**
         * 
         */
        importRemoteFunction(handle, socket, functions) {
            //TODO : improve this using cache

            var _this = this;
            if (functions === undefined) return;
            for (var i = 0; i < functions.length; i++) {
                (function (idx, fname) {
                    var proxy = handle;
                    /* namespace parsing */
                    var ftokens = fname.split('.');
                    for (var i = 0; i < ftokens.length - 1; i++) {
                        proxy[ftokens[i]] = proxy[ftokens[i]] || {};
                        proxy = proxy[ftokens[i]];
                    }
                    var _fname = ftokens[ftokens.length - 1];
                    /* end namespace parsing */

                    //TODO : do we need to re generate proxy function if it's already declared ?
                    proxy[_fname] = function () {
                        
                        var proxyObj = {
                            status: 0,
                            result: null,
                            error: null,
                            sig:null,
                            callback: function () { },
                            errorCallback: function () { },

                            //TODO : use the standardized promise syntax instead of onReady
                            then: function (fn, errorFn) {
                                if (this.status != 0) {

                                    if (this.error == null)
                                        fn(this.result);
                                    else
                                        errorFn(this.error);

                                    return;
                                }

                                if (typeof fn == 'function') {
                                    this.callback = fn;
                                }

                                if (typeof errorFn == 'function') {
                                    this.errorCallback = errorFn;
                                }

                            }
                        /*
                            onReady: function (fn)
                            {
                                if (typeof fn == 'function')
                                {
                                    this.callback = fn;
                                }
                            }
                        */
                        }
                        proxyObj['onReady'] = proxyObj.then;

                        var RMIObj: any = {};

                        
                        var argsArray = Array.prototype.slice.call(arguments, 0);
                        var uid = Eureca.Util.randomStr();
                        proxyObj.sig = uid;


                        _this.registerCallBack(uid, proxyObj);



                        RMIObj[Protocol.functionId] = _this.settings.useIndexes ? idx : fname;
                        RMIObj[Protocol.signatureId] = uid;
                        if (argsArray.length > 0) RMIObj[Protocol.argsId] = argsArray;
                        socket.send(JSON.stringify(RMIObj));

                        return proxyObj;
                    }
                })(i, functions[i]);
            }

        }


        private sendResult(socket, sig, result, error) {
            if (!socket) return;
            var retObj = {};
            retObj[Protocol.signatureId] = sig;
            retObj[Protocol.resultId] = result;
            retObj[Protocol.errorId] = error;
            socket.send(JSON.stringify(retObj));
        }
        invoke(context, handle, obj, socket?) {


            var fId = parseInt(obj[Protocol.functionId]);
            var fname = isNaN(fId) ? obj[Protocol.functionId] : handle.contract[fId];

            /* browing namespace */
            var ftokens = fname.split('.');
            var func = handle.exports;
            for (var i = 0; i < ftokens.length; i++) {
                if (!func) {
                    console.log('Invoke error', obj[Protocol.functionId] + ' is not a function', '');
                    this.sendResult(socket, obj[Protocol.signatureId], null, 'Invoke error : ' + obj[Protocol.functionId] + ' is not a function');
                    return;
                }
                func = func[ftokens[i]];
            }
            /* ***************** */


            //var func = this.exports[fname];
            if (typeof func != 'function') {
                //socket.send('Invoke error');
                console.log('Invoke error', obj[Protocol.functionId] + ' is not a function', '');
                this.sendResult(socket, obj[Protocol.signatureId], null, 'Invoke error : ' + obj[Protocol.functionId] + ' is not a function');
                return;
            }
            //obj.a.push(conn); //add connection object to arguments



            try {
                obj[Protocol.argsId] = obj[Protocol.argsId] || [];
                var result = func.apply(context, obj[Protocol.argsId]);

                //console.log('sending back result ', result, obj)

                if (socket && obj[Protocol.signatureId] && !context.async) {

                    this.sendResult(socket, obj[Protocol.signatureId], result, null);
                    /*
                    var retObj = {};
                    retObj[Protocol.signatureId] = obj[Protocol.signatureId];
                    retObj[Protocol.resultId] = result;
                    socket.send(JSON.stringify(retObj));
                    */

                }

                obj[Protocol.argsId].unshift(socket);
                if (typeof func.onCall == 'function') func.onCall.apply(context, obj[Protocol.argsId]);
            } catch (ex) {
                console.log('EURECA Invoke exception!! ', ex.stack);
            }

        }
    }

}
