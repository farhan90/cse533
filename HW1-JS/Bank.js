//pragma mark - Requires
var http = require('http');

//pragma mark - Public Methods

module.exports = {
  	createBank: function(ip, port, name, chainLength) {
		console.log("Creating Bank on port: " + port + ", IP: " + ip + ", Name: " + name + "Chain Length: " + chainLength);
		createServer(ip, port)
	},
	foo: function () {
		// example
	}
};

//pragma mark - Creating Server

function createServer(ip, port) {
	http.createServer(function(request, response) {
		var reqData = "";
		request.on('data', function(chunk) {
			reqData += chunk;
		});
		request.on('end', function() {
			console.log("Request Data: " + reqData);
			var reqObj = JSON.parse(reqData);
			recieved(reqObj, response);
		});

	}).listen(port);
}

//pragma mark - Bank Handle Methods

function recieved(data, response) {
	console.log('recieved: ' + JSON.stringify(data));
	if(data.type == "deposit") {
		deposit(data, response);
	}
}

function deposit(data, response) {
	var resObj = {
		reqId : data.reqId,
		outcome : 'Proccessed',
		balance : data.amount
	};
	response.writeHead(200);
	response.end(JSON.stringify(resObj));
}
