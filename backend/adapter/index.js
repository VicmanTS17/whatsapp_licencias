import { readFileSync } from "fs";
const stepsInitial = JSON.parse(readFileSync("./flow/initial.json"));
const stepsReponse = JSON.parse(readFileSync("./flow/response.json"));
import axios from 'axios'
import { log } from "console";

const get = (message) => new Promise((resolve, reject) => {
    /**
     * Si no estas usando un gesto de base de datos
     */

    if (process.env.DATABASE === 'none') {
        console.log(message)
        const { key } = stepsInitial.find(k => k.keywords.includes(message)) || { key: null }
        const response = key || null
        resolve(response)
    }

})


const reply = async (step) => {
    let response = [];
    if (process.env.DATABASE === 'none') {
        response = stepsReponse[step] || {};
        return response;
    }
}

const request = async (telefono, opcion) => {
    let message = [];
    if (opcion === "1-1-0") {
        message = stepsReponse["STEP_1_1_0"];
        return message;
    }
    const response = await axios.post('http://201.144.50.38/APIRestJIAPAZ/public/bot/consultas', {
        "telefono": telefono, "opcion": opcion
    })
    if (response.status == 200) {
        console.log(response.data);
        console.log(typeof (response.data));
        if (typeof (response.data) !== "string") {
            //let rows = 
            message = stepsReponse["DEFAULT"] || {};
        } else message = stepsReponse[response.data] || {};
    } else
        message.replyMessage.text = 'No se encontraron datos, revisa de nuevo los datos proporcionados';
    return message;
}



export { get, reply, request }