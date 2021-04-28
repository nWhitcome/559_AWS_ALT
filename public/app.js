var socket = io();

const store = new Vuex.Store({
})

Vue.component('custom-button', {
    props: ['text-val'],
    template: `
        <div class="custom-button">{{text-val}} Test</div>
    `
})

new Vue({
    el:'#app',
    store,
    template:`
        <div id="app-area">
            <h1>Hello there. I just started this project. Nothing to see here.</h1>
            <custom-button text-val="Create Instance"></custom-button>
        </div>
    `
})

