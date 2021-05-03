var socket = io();

// A Vuex store for state management.
const store = new Vuex.Store({
    state: {
        modal: {
            show: false,
            content: ""
        },
        ASInstances: []
    },
    mutations: {
        toggleModal(state, newContent){
            state.modal.content = newContent;
            state.modal.show = !state.modal.show;
        },
        updateAS(state, newContent){
            state.ASInstances = JSON.parse(newContent);
            console.log(newContent);
        }
    }
})

// A custom button that can be placed. Made for consistency.
Vue.component('custom-button', {
    props: ['textVal'],
    template: `
    <div class="custom-button no-select">{{textVal}}</div>
    `
})

// The modal that displays important information to the user.
Vue.component('modal', {
    methods: {
        closeModal: function(){
            store.commit('toggleModal', "");
        }
    },
    template: `
    <div id="modal-back">
        <div id="modal">
            <p>{{this.$store.state.modal.content}}</p>
            <custom-button @click.native="closeModal()" textVal="Ok"></custom-button>
        </div>
    </div>
    `
})

// Toggles the modal when there is an error
socket.on("error", (errorMessage) => {
    store.commit('toggleModal', errorMessage)
})

// Calls the function that downloads a private key and then displays a modal with key information.
socket.on("getKey", (fileInfo) => {
    downloadFile(fileInfo.name + ".pem", fileInfo.content);
    store.commit('toggleModal', "IMPORTANT: The private key required to access the created instance has begun its download. Do not lose this key or share it with anyone.")
})

// Updates the gui with current auto scaling group information
socket.on("updateAS", (newContent) => {
    store.commit('updateAS', newContent);
})

// Downloads a file with private key information.
function downloadFile(filename, text){
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

// The vue app that displays the general HTML Vue layout for the page. Also has functions that are called when HTML components are clicked.
new Vue({
    el:'#app',
    store,
    data: function(){
        return {
            nameMessage: null,
            maxScale: null,
            desired: null
        }
    },
    methods:{
        createLaunchConfig: function(nameValue, maxScale, desired){
            socket.emit("makeGroup", nameValue, {max: maxScale, desired: desired});
        },
        refresh: function(){
            socket.emit("refresh");
        },
        inactiveInst: function (instance){
            var numInactive = instance.max - instance.instances.length;
            var holderArr = [];
            for(var i = 0; i < numInactive; i++) holderArr.push("");
            return holderArr; 
        },
        deleteAS(item){
            console.log(item)
            socket.emit("delete", item.name.substring(0, item.name.length - 2))
        },
        openModal(content){
            store.commit('toggleModal', "Id: " + content);
        }
    },
    template:`
        <div id="app-area">
            <div id="middle-box">
                <div id="topContent">
                    <input v-model="nameMessage" placeholder="Instance name">
                    <input v-model="maxScale" placeholder="Max scaling size">
                    <input v-model="desired" placeholder="Desired scale capacity">
                    <div id="createRefreshBox">
                        <custom-button style="width: 120px;" @click.native="createLaunchConfig(nameMessage, maxScale, desired)" text-val="Create Instance" ></custom-button>
                        <custom-button @click.native="refresh()" text-val="Refresh"></custom-button>
                    </div>
                </div>
                <div id="ASGHolder">
                    <div class="ASGGroup" v-for="item in this.$store.state.ASInstances">
                        <div class="ASGInfo">{{item.name}}
                            <custom-button text-val="Delete" @click.native="deleteAS(item)"></custom-button>
                        </div>
                        <div class="ASGItem" style="cursor:pointer" v-for="(instance, index) in item.instances" @click="openModal(instance.InstanceId)">{{index}}</div>
                        <div class="ASGItem" v-for="inactive in inactiveInst(item)" style="background-color: #D3D3CB"></div>
                    </div>
                </div>
            </div>
            <modal v-if="this.$store.state.modal.show"></modal>
        </div>
    `
})

