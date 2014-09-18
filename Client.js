var http = require('http');

var options = {
	hostname:'127.0.0.1',
	port:'5678',
	method : 'POST',
	path : '/'
};

process.argv.forEach(function (val, index, array) {
  	if(array[2] == 'deposit' && index == 4) {
  		var actNum = parseInt(array[3]);
 		var amnt = parseInt(array[4]);
  		deposit(actNum, amnt);
  	}
  	else if(array[2] == 'getBalance' && index == 3) {
  		var actNum = parseInt(array[3]);
  		getBalance(actNum);
  	}
});

function getBalance(actNum) {
	function handleResponse(response) {
		var serverData = '';
		response.on('data', function(chunk) {
			serverData += chunk;
		});

		response.on('end', function() {
			console.log(serverData);
		});
	}

	var req = http.request(options, handleResponse);

	var reqObj = {
		reqId : 1,
		type : "getBalance",
		act : actNum
	};
	var reqText = JSON.stringify(reqObj);

	console.log('Request Text: ' + reqText);
	req.write(reqText);
	req.end();
}

function deposit(actNum, amnt) {
	function handleResponse(response) {
		var serverData = '';
		response.on('data', function(chunk) {
			serverData += chunk;
		});

		response.on('end', function() {
			console.log(serverData);
		});
	}

	var req = http.request(options, function(response) {
		handleResponse(response);
	});

	var reqObj = {
		reqId : 1,
		type : "deposit",
		amount : amnt,
		act : actNum
	};
	var reqText = JSON.stringify(reqObj);

	console.log('Request Text: ' + reqText);
	req.write(reqText);
	req.end();
}