Readme for Node JS version

INSTRUCTIONS:
To run: node Launcher.js        			- will run w/ with the default config, config.json
Optional: node Launcher.js input.json		- will run w/ the specifed file, input.json

You must have node.js installed
http://nodejs.org

BUGS AND LIMITATIONS:
- Bugs:
  - Do not support malformed config files

- Limitations:
  - No failure detection
  - Code would have to be modified to support multiple computers:
    - Client/server/master should check if the local machine's ip is the same as that mentioned
    - All servers should theoretically listen on the same port as well

LANGUAGE COMPARISON:

NodeJS: 
- Such a pain to send messages between servers, had to create our own send and recieve layer
- When performing async tasks was much easier to register callbacks: Example:
  - asyncTaskWithCallback(inputArg1, inputArg2, function(outcomeData) {
    	//code to be done on async finished
    })

DistAlgo:
TODO: Farhan

CONTRIBUTIONS:
Jimmy: NodeJS
Farhan: DistAlgo

OTHER COMMENTS:
The default config file 'config.json' shows deposit, withdraw, failed withdraw, and getBalance all one one account. 
It also shows how to manually set the reqId, the two last transactions share a reqId w/ the first transaction. 
One will produce an outcome of Processed, the other InconsistentHistory
