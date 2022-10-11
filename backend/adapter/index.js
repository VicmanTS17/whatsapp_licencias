import { readFileSync } from "fs";
const stepsInitial = JSON.parse(readFileSync("./flow/initial.json"));
const stepsReponse = JSON.parse(readFileSync("./flow/response.json"));
import axios from 'axios'

const get = (message) => new Promise((resolve, reject) => {
    if (message.includes('saldo')) {
        resolve('SALDO')
    }
    if (message.includes('tandeo')) {
        resolve('TANDEO')
    }
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

const request = async (telefono, opcion = "", ruta = 'inmuebles') => {
    let message = stepsReponse["DEFAULT"] || {};
    try {
        const response = await axios.post(`http://201.144.50.38/APIRestJIAPAZ/public/bot/${ruta}`,
            { telefono: telefono, opcion: opcion })
        console.log(typeof (response.data));
        console.log(response.data)
        if (response.status === 200) {
            if (typeof (response.data) !== "string") {
                message = response.data;
            } else if (typeof (response.data) === "string") {
                message.replyMessage.text = response.data;
            }
        } else message.replyMessage.text = 'No se encontraron datos, revisa de nuevo los datos proporcionados';
    } catch (error) {
        console.log(error);
        message.replyMessage.text = 'No se encontraron datos, revisa de nuevo los datos proporcionados';
    }
    return message;
}



export { get, reply, request }