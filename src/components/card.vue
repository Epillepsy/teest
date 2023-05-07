<template>
    <div>
        {{cardInfo}}
<div>
    <div>
        {{card.name}}
    </div>
    <div>
        {{card.type}}
    </div>
</div>
        <div>
            ============================================
        </div>
    </div>
</template>

<script>
export default {
    name: "CardComp",
    props: {
        cardInfo: {
            type: Object
        }
    }
}
</script>