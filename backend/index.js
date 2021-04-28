const { resolveSoa } = require('dns');
var express = require('express');
var app = express();
var port = process.env.PORT || 3000;
var server = require('http').createServer(app);
path = require('path');

app.use(express.static(__dirname));
app.get('/', function(request, response){
    response.sendFile(path.join(__dirname, '..', '/frontend/index.html'));
})

server.listen(port);
console.log("listening on port " + port);