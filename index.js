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
    refreshScaling(socket);
    socket.on("makeGroup", (name, scaleGroup) => {
        keyMake(name, socket, scaleGroup);
    })
    socket.on("refresh", () => {
        refreshScaling(socket);
    })
    socket.on("delete", (name) => {
        ASDelete(name, socket);
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

function keyDelete(keyName, socket){
    var keyParams = {
        KeyName: keyName + "Key",
    };
    ec2.deleteKeyPair(keyParams, function(err, data){
        if(err){
            console.log(err);
        }
        else{
            console.log(data);
            SGDelete(keyName, socket);
        }
    })
}

function SGMake(groupName, socket, scaleGroup){
    ec2.describeVpcs(function(err, data){
        if(err) {
            io.to(socket.id).emit("error", "Err: Cannot retrieve a VPC");
        }
        else{
            vpc = null;
            for(var i = 0; i < data.Vpcs.length || vpc == null; i++){
                if(data.Vpcs[i].IsDefault){
                    vpc = data.Vpcs[i].VpcId;
                }
            }
            var paramsSecurityGroup = {
                Description: 'Security group for ' + groupName,
                GroupName: groupName + "SG",
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
                            LCMake(groupName, socket, SecurityGroupId, scaleGroup, vpc);
                        }
                    })
                }
            })
        }
    })
}

function SGDelete(SGName, socket){
    var SGParams = {
        GroupName: SGName + "SG"
    }
    ec2.deleteSecurityGroup(SGParams, function(err, data) {
        if(err){
            console.log(err)
        }
        else{
            console.log("Deleted security group")
        }
    })
}

function LCMake(LCName, socket, SGId, scaleGroup, vpc){
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
            console.log("Launch configuration creation sucessful");
            listSubnets(LCName, socket, scaleGroup, vpc);
        }
    })
}

function LCDelete(LCName, socket){
    var LCParams = {
        LaunchConfigurationName: LCName + "LC",
    }
    autoscaling.deleteLaunchConfiguration(LCParams, function(err, data){
        if(err){
            console.log(err)
        }
        else{
            console.log("Deleted launch configuration")
            keyDelete(LCName, socket);
        }
    })
}

function ASMake(ASName, socket, scaleGroup, subnets){
    var subnetIds = [];
    for(var i = 0; i < subnets.length; i++){
        subnetIds.push(subnets[i].SubnetId);
    }
    var ASParams = {
        AutoScalingGroupName: ASName + "AS",
        HealthCheckGracePeriod: 300,
        LaunchConfigurationName: ASName + "LC",
        MaxSize: scaleGroup.max,
        MinSize: 1,
        VPCZoneIdentifier: subnetIds.join(),
        DesiredCapacity: scaleGroup.desired
    }
    autoscaling.createAutoScalingGroup(ASParams, function(err){
        if(err){
            console.log(err)
            io.to(socket.id).emit("error", "Err: Couldn't create auto scaling group");
        }
        else{
            console.log("Auto scaling group sucessfully created")
            scalingPolicyMake(ASName, socket)
        }
    })
}

function ASDelete(ASName, socket){
    var ASParams = {
        AutoScalingGroupName: ASName + "AS",
        ForceDelete: true
    };
    autoscaling.deleteAutoScalingGroup(ASParams, function(err, data){
        if(err){
            console.log(err)
        }
        else{
            console.log("Auto scaling group deleted")
            LCDelete(ASName, socket);
        }
    })
}

function listSubnets(LSName, socket, scaleGroup, vpc){
    var LSParams = {
        Filters: [
            {
                Name: 'vpc-id',
                Values: [
                    vpc
                ]
            }
        ]
    };
    ec2.describeSubnets(LSParams, function(err, data){
        if(err){
            io.to(socket.id).emit("error", "Err: Could not find subnet info for the VPC");
            console.log(err)
        }
        else{
            ASMake(LSName, socket, scaleGroup, data.Subnets)
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
            refreshScaling(socket);
        }
    })
}

function refreshScaling(socket){
    var refreshParams = {
    };
    autoscaling.describeAutoScalingGroups(refreshParams, function(err, data){
        if(err){
            io.to(socket.id).emit("error", "Err: Could not refresh auto scaling group information");
        }
        else{
            var scaleData = [];
            for(var i = 0; i < data.AutoScalingGroups.length; i++){
                scaleData.push({name: data.AutoScalingGroups[i].AutoScalingGroupName, 
                                desired: data.AutoScalingGroups[i].DesiredCapacity, 
                                max: data.AutoScalingGroups[i].MaxSize, 
                                instances: data.AutoScalingGroups[i].Instances})
            }
            io.to(socket.id).emit("updateAS", JSON.stringify(scaleData));
        }
    });
}