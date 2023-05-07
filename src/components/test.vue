<template>
    <div>
        this is a test {{ testNumber }} 
        <div v-for="card in dataCard.data" :key="card.id">
            <cardComponent :cardInfo="card" @click="goToPage(card)"/>
        </div>
        <button @click="increment">increment </button>
    </div>
</template>
<script>
import axios from "axios"
// const endpoint ="https://db.ygoprodeck.com/api/v7/cardinfo.php"
import cardComponent from "./card.vue"
export default {
    name: "testL",
    components: {
        cardComponent
    },
    data() {
        return {
            testNumber: 0,
            dataCard: []
        }
    },
    mounted() {

        axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php')
        .then((response) => {
            this.dataCard = response.data;
        });
    },
    methods: {
        add(a, b) {
            return a + b
        },
        increment() {
            this.testNumber += 1
        }
    }
}
</script>