const { resolveSoa } = require('dns');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const server = require('http').createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
var AWS = require('aws-sdk');
const helmet = require('helmet');
path = require('path');

app.use(express.static(__dirname));
app.use(helmet());
app.get('/', function(request, response){
    response.sendFile(__dirname + '/index.html');
})

io.on('connection', (socket) => {
    console.log("a user connected");
})

server.listen(port);
console.log("listening on port " + port);

AWS.config.getCredentials(function(err){
    if(err) console.log(err.stack);
    else{
        console.log("Access key: ", AWS.config.credentials.accessKeyId);
    }
})

var params = {

}
//var ec2 = new AWS.EC2();