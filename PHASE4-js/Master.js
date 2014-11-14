//var banks = {}; //dict of key: bankName -> list of alive bankServer's
/*
bankServer {
	ip: ''
	port: ''
}


API:

request w/ {
	type = 'getHeadForBank'
	bank = 'TFCU' (or other bank name)
}
 returns response of {
	'ip' = ip adress of banks head
	'port' = port of banks head
 }

*/

var http = require('http');
var fs = require('fs');

module.exports = {
	createMaster: function(banks, port, ip) {
		return new Master(banks, port, ip);
	}
};

function Master(banks, port, ip) {
	this.banks = banks;
	this.port = port;
	this.ip = ip;
	this.createServer();

	//used in finding failures - new succ and preds
	this.oldState = {};
	this.currentState = {};
	this.orderCameOnline = {};

	//used in chain extension
	this.joiningTails = {};
	this.lastTails = {};

	for(var name in banks) {
		var bank = banks[name];
		this.orderCameOnline[name] = [];
		this.currentState[name] = {};
		for(var i in bank) {
			var node = bank[i];
			this.currentState[name][node.port] = 0;
			if(node.startTime == 0) {
				this.currentState[name][node.port] = 1;
				this.orderCameOnline[name].push(node.port);
			}
		}
	}
	this.oldState = JSON.parse(JSON.stringify(this.currentState));

	var master = this;
	this.wstream = null;
	fs.mkdir('./logs',function(e){
		fs.mkdir('./logs/master',function(e){
			master.wstream = fs.createWriteStream('./logs/master/master.log');
		});
	});

	setInterval(function() {
		checkForFailuresAndAditions(master);
	}, 5000);


	return this;
}

Master.prototype.createServer = function() {
	log("Master attempting to listen on: " + this.port, this);
	var master = this;

	http.createServer(function(request, response) {
		var reqData = "";
		request.on('data', function(chunk) {
			reqData += chunk;
		});
		request.on('end', function() {
			var reqObj = JSON.parse(reqData);
			recieved(reqObj, response, master);
		});
	}).listen(this.port);
}

//#pragma mark - Failure and Addition notifications

function indexForNode(bank, node, master) {
	var keys = master.orderCameOnline[bank];
	var index = 0;
	for(var i = 0; i<keys.length; i++) {
		if(keys[i] == node) {
			index = i;
			break;
		}
	}
	return {"index" : index, "keys" : keys};
}

function predForNode(bank, node, master) {
	var ret = indexForNode(bank, node, master);
	var index = ret["index"];
	var keys = ret["keys"];

	for(var i=index-1; i>= 0; i--) {
		if(master.oldState[bank][keys[i]] == 1) {
			var port = keys[i];
			return getNodeFor(bank, port, master);
		}
	}
	return null;
}

function succForNode(bank, node, master) {
	var ret = indexForNode(bank, node, master);
	var index = ret["index"];
	var keys = ret["keys"];

	for(var i=index+1; i < keys.length; i++) {
		if(master.oldState[bank][keys[i]] == 1) {
			var port = keys[i];
			return getNodeFor(bank, port, master);
		}
	}
	return null;
}

function checkForFailuresAndAditions(master) {
	log("CHECKING FOR FAILURES", master);
	var oldState = JSON.parse(JSON.stringify(master.oldState));
	master.oldState = JSON.parse(JSON.stringify(master.currentState));

	if(JSON.stringify(master.currentState) != JSON.stringify(oldState)) {
		var ignore = false;
		for(var bank in master.currentState) {
			var len = 0;
			for(k in master.currentState[bank]) len++;
			for(var i = len-1; i>=0; i--) {
				var node = master.orderCameOnline[bank][i];
				var alive = master.currentState[bank][node];
				if(alive == 0 && oldState[bank][node] == 1) {
					//this node has failed
					//no need to notiy this node

					//if it is old tail inform joinging tail
					//new tail 
					//and new existing tail that it has a neightbor
					if(master.lastTails[bank] != null && master.lastTails[bank].port == node && master.joiningTails[bank] != null) {
						//send oldTailCrash to joiner
						var joiner = master.joiningTails[bank];
						var joinerNode = getNodeFor(bank, joiner.port, master);
						sendRequest(joinerNode.ip, joinerNode.port, {"type":"oldTailCrash"}, null, master);
						master.currentState[bank][joiner.port] = 0;
						master.oldState[bank][joiner.port] = 0;
						master.joiningTails[bank] = null;
						log("Informing the joinging tail the current tail crashed", master);
					}
				}
				else if(alive == 1 && oldState[bank][node] == 0) {
					//this node has been started - is handled else where
				}
				else if(alive == 1 && oldState[bank][node] == 1 && ignore == false) {
					//this node remained alive - notify it of new pred and succ
					var newPred = predForNode(bank, node, master);
					var newSucc = succForNode(bank, node, master);

					var bankNode = getNodeFor(bank, node, master);
					log("Sending failure detected", master);
					sendRequest(bankNode.ip, bankNode.port, {
						"type" : "NewPredSuccCrash",
						"newPred" : newPred,
						"newSucc" : newSucc 
					}, null, master);
				}
				else if(alive == 0 && oldState[bank][node] == 2) {
					//this guys was joining and failed -> inform the old tail
					log("Joining Node Crashed: Informing old tail of crash", master);
					var tailToNotify = master.lastTails[bank];
					sendRequest(tailToNotify.ip, tailToNotify.port, {
						"type" : "YouveGotAFriend",
						"port" : -1,
						"ip" : "-1" 
					}, null, master);
					master.joiningTails[bank] = null;
					master.lastTails[bank] = null;

					ignore = master.currentState[bank][tailToNotify.port] == 1;
				}
			}
		}
	}

	//update the state objects
	for(var name in master.banks) {
		var bank = master.banks[name];
		master.currentState[name] = {};
		for(var i in bank) {
			var node = bank[i];
			master.currentState[name][node.port] = 0;
		}
	}
}

//#pragma mark - response methods

function recieved(data, response, master) {
	if(data.type == "getHeadForBank")
		getHead(data.bank, response, master);
	else if(data.type == "getTailForBank")
		getTail(data.bank, response, master);
	else if(data.type == "getSucAndPred")
		getSucAndPred(data.bank, data.port, data.ip, response, master);
	else if(data.type == "ImAlive") {
		handleAliveMessage(data.bank, data.pk, master);
		response.end();
	}
	else if(data.type == "NewTailReady") {
		handleNewTailReady(data.ip, data.port, data.bank, master);
		response.end();
	}
}

function handleNewTailReady(ip, port, bank, master) {
	log("Master informed of new tail for " + bank, master);
	if(master.oldState[bank][port] == 2)
		master.oldState[bank][port] = 1;
	if(master.currentState[bank][port] == 2)
		master.currentState[bank][port] = 1;

	master.joiningTails[bank] = null;	
	master.lastTails[bank] = null;
}

function handleAliveMessage(bank, pk, master) {
	master.currentState[bank][pk] = 1;

	var otherNodeIsJoining = !portAndBankCheck({'port' : pk, 'bank' : bank}, master.joiningTails[bank]);
	if(master.oldState[bank][pk] == 0 && master.joiningTails[bank] != null && otherNodeIsJoining) {
		//someone else is already joining. We will be pinged later with this bank/port combo, when the other node has finished joining we will let this join
		master.currentState[bank][pk] = 0;
		log('someone else already joining, we will ignore this nodes join request', master);
	}
	else if(master.oldState[bank][pk] == 0 || (master.joiningTails[bank] != null && bank == master.joiningTails[bank].bank && pk == master.joiningTails[bank].port)) {
		
		if(master.joiningTails[bank] == null) {
			log('New node came online, informing current tail', master);
			master.orderCameOnline[bank].push(pk);
			master.joiningTails[bank] = {
				'bank'  : bank,
				'port'	: pk
			};

			var node = getNodeFor(bank, pk, master);

			var tail = tailOfChain(bank, master);
			master.lastTails[bank] = tail;
			if(tail.ip != null && tail.port != null)
				sendRequest(tail.ip, tail.port, {
					"type" : "YouveGotAFriend",
					"port" : node.port,
					"ip"   : node.ip
				}, null, master);
		}
		// # > 1 means not ready to be tail but in queue of doing so
		master.oldState[bank][pk] = 2;
		master.currentState[bank][pk] = 2;
	}
}

getSucAndPred = function(bank, port, ip, response, master) {
	suc = succForNode(bank, port, master);
	pred = predForNode(bank, port, master);

	var ret = JSON.stringify({
		'suc' 	: suc,
		'pred' 	: pred
	});
	log("Sending: " + ret, master);
	response.writeHead(200);
	response.end(ret);
}

function getNodeFor(bank, port, master) {
	for(var i in master.banks[bank]) {
		var bankNode = master.banks[bank][i];
		if(bankNode.port == port) {
			return {
				'ip' : bankNode.ip,
				'port' : bankNode.port
			};
		}
	}
}

getHead = function(bank, response, master) {
	var ret = indexForNode(bank, -1, master);
	var keys = ret['keys'];
	
	var resObj = {
		'ip' : null,
		'port' : null
	};
	for(var i=0; i < keys.length; i++) {
		if(master.oldState[bank][keys[i]] == 1) {
			var port = keys[i];
			resObj = getNodeFor(bank, port, master);
			break;
		}
	}
	response.writeHead(200);
	response.end(JSON.stringify(resObj));
};

function tailOfChain(bank, master) {
	var ret = indexForNode(bank, -1, master);
	var keys = ret['keys'];
	
	var resObj = {
		'ip' : null,
		'port' : null
	};
	for(var i=keys.length-1; i >= 0; i--) {
		if(master.oldState[bank][keys[i]] == 1) {
			var port = keys[i];
			resObj = getNodeFor(bank, port, master);
			break;
		}
	}
	return resObj;
}

getTail = function(bank, response, master) {
	var resObj = tailOfChain(bank, master);
	response.writeHead(200);
	response.end(JSON.stringify(resObj));
};

//#pragma mark - magic send method

//helper for sending request to ip - port
function sendRequest(ip, portNum, reqObj, callback, master) {
	var options = {
		hostname	: ip,
		port		: portNum,
		method 		: 'POST',
		path 		: '/'
	};
	log('sending: ' + JSON.stringify(reqObj), master);
	var req = http.request(options, (callback != null)? callback : handleResponse);
	var reqText = JSON.stringify(reqObj);
	req.write(reqText);
	req.on('error', function(error) {
	  	// Error handling here
	});
	req.end();
}

//helper for extracting the JSON object from the response
function getResponseObj(response, callback) {
	var serverData = '';
	response.on('data', function(chunk) {
		serverData += chunk;
	});

	response.on('end', function() {
		if(callback != null)
			callback(JSON.parse(serverData));
	});
}

function handleResponse(response) {
	getResponseObj(response, null);
}

//helper for comparing ip and ports
function portAndBankCheck(s1, s2) {
	if(s1 == null && s2 == null)
		return true;
	else if(s1 != null && s2 != null)
		return s1.port == s2.port && s1.bank == s2.bank;
	else
		return false;
}

//#pragma mark - logging

function log(text, master) {
	var d = new Date().getTime();
	text = JSON.stringify(d) + ': ' + text;
	console.log(text);

	if(master.wstream != null) {
		master.wstream.write(text);
		master.wstream.write('\n\n');
	}
}
