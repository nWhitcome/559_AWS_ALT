var socket = io();

const store = new Vuex.Store({
    state: {
        modal: {
            show: false,
            content: ""
        }
    },
    mutations: {
        toggleModal(state, newContent, newButton){
            state.modal.content = newContent;
            state.modal.buttonText = newButton;
            state.modal.show = !state.modal.show;
        }
    }
})

Vue.component('custom-button', {
    props: ['textVal'],
    template: `
    <div class="custom-button no-select">{{textVal}}</div>
    `
})

Vue.component('modal', {
    methods: {
        closeModal: function(){
            store.commit('toggleModal', "", "");
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

socket.on("error", (errorMessage) => {
    store.commit('toggleModal', errorMessage)
})

socket.on("getKey", (fileInfo) => {
    downloadFile(fileInfo.name + ".pem", fileInfo.content);
    store.commit('toggleModal', "IMPORTANT: The private key required to access the created instance has begun its download. Do not lose this key or share it with anyone.")
})

function downloadFile(filename, text){
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

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
    },
    template:`
        <div id="app-area">
            <div id="middle-box"> 
                <input v-model="nameMessage" placeholder="Instance name">
                <input v-model="maxScale" placeholder="Max scaling size">
                <input v-model="desired" placeholder="Desired scale capacity">
                <custom-button @click.native="createLaunchConfig(nameMessage, maxScale, desired)" text-val="Create Instance" ></custom-button>
            </div>
            <modal v-if="this.$store.state.modal.show"></modal>
        </div>
    `
})

