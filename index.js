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
    socket.on("makeGroup", (name, scaleGroup) => {
        keyMake(name, socket, scaleGroup);
    })
})

server.listen(port);
console.log("listening on port " + port);

AWS.config.getCredentials(function(err){
    if(err) console.log(err.stack);
    else{
        AWS.config.update({region: 'us-east-2'})
    }
})

var ec2 = new AWS.EC2();
var autoscaling = new AWS.AutoScaling();

function keyMake(keyName, socket, scaleGroup){
    var keyParams = {
        KeyName: keyName + "Key"
    };
    ec2.createKeyPair(keyParams, function(err, data){
        if(err){
            console.log(err.code)
            if(err.code =='InvalidKeyPair.Duplicate'){
                io.to(socket.id).emit("error", "Err: A key with that name already exists");
            }
        }
        else{
            io.to(socket.id).emit("getKey", {name: keyName, content: data.KeyMaterial});
            SGMake(keyName, socket, scaleGroup)
        }
    })
}

function SGMake(groupName, socket, scaleGroup){
    ec2.describeVpcs(function(err, data){
        if(err) {
            io.to(socket.id).emit("error", "Err: Cannot retrieve a VPC");
        }
        else{
            vpc = data.Vpcs[0].VpcId;
            var paramsSecurityGroup = {
                Description: 'Security group for ' + groupName,
                GroupName: groupName + "SG",
                VpcId: vpc
            };
            ec2.createSecurityGroup(paramsSecurityGroup, function(err, data){
                if(err) {
                    io.to(socket.id).emit("error", "Err: Could not make securty group");
                }
                else{
                    var SecurityGroupId = data.GroupId;
                    console.log("Success", SecurityGroupId)
                    var paramsIngress = {
                        GroupId: SecurityGroupId,
                        IpPermissions:[
                            {
                                IpProtocol: "tcp",
                                FromPort: 22,
                                ToPort: 22,
                                IpRanges: [{"CidrIp":"0.0.0.0/0"}]
                            },
                            {
                                IpProtocol: "tcp",
                                FromPort: 80,
                                ToPort: 80,
                                IpRanges: [{"CidrIp":"0.0.0.0/0"}]
                            }
                        ]
                    };
                    ec2.authorizeSecurityGroupIngress(paramsIngress, function(err, data){
                        if(err){
                            io.to(socket.id).emit("error", "Err: Ingress set failed");
                        }
                        else{
                            console.log("Ingress successfully set", data);
                            LCMake(groupName, socket, SecurityGroupId, scaleGroup);
                        }
                    })
                }
            })
        }
    })
}

function LCMake(LCName, socket, SGId, scaleGroup){
    var LCParams = {
        ImageId: "ami-e81b308d",
        UserData: "",
        LaunchConfigurationName: LCName + "LC",
        InstanceType: "t2.micro",
        SecurityGroups: [SGId],
        KeyName: LCName + "Key"
    }
    autoscaling.createLaunchConfiguration(LCParams, function(err, data){
        if(err){
            console.log(err.stack);
            io.to(socket.id).emit("error", "Err: Couldn't create launch configuration");
        }
        else{
            console.log(data);
        }
    })
}

function ASMake(ASName, socket, scaleGroup){
    var ASParams = {
        AutoScalingGroupName: ASName + "AS",
        HealthCheckGracePeriod: 300,
        LaunchConfigurationName: ASName + "LC",
        MaxSize: scaleGroup.maxScale,
        MinSize: 1,
        VPCZoneIdentifier: "subnet-c918b4a0, subnet-a018ebdb, subnet-25584e6f",
        DesiredCapacity: scaleGroup.desired
    }
    autoscaling.createAutoScalingGroup(ASParams, function(err){
        if(err){
            io.to(socket.id).emit("error", "Err: Couldn't create auto scaling group");
        }
        else{
            console.log("Auto scaling group created")
        }
    })
}

function scalingPolicyMake(SPName, socket){
    var SPParams = {
        AutoScalingGroupName: SPName + "AS",
        PolicyName: SPName + "SP",
        PolicyType: "TargetTrackingScaling",
        EstimatedInstanceWarmup: 100,
        TargetTrackingConfiguration: {
            PredefinedMetricSpecification: {
                PredefinedMetricType: "ASGAverageCPUUtilization",
            },
            TargetValue: 50.0
        }
    };
    autoscaling.putScalingPolicy(SPParams, function(err, data) {
        if(err){
            io.to(socket.id).emit("error", "Err: Couldn't add scaling policy to group");
        }
        else{
            console.log("Scaling policy added")
        }
    })
}