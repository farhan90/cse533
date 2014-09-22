var http = require('http');

module.exports = {
	sendRequest: function(ip, portNum, reqObj) {
		var options = {
			hostname	: ip,
			port		: portNum,
			method 		: 'POST',
			path 		: '/'
		};

		var req = http.request(options, handleResponse);
		var reqText = JSON.stringify(reqObj);
		req.write(reqText);
		req.end();
	}
};

function handleResponse(response) {
	var serverData = '';
	response.on('data', function(chunk) {
		serverData += chunk;
	});

	response.on('end', function() {
		console.log("Client: Response Data: " + serverData);
	});
}
