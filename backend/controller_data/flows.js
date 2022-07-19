import { get, reply, request } from '../adapter/index.js'
//import { saveExternalFile, checkIsUrl } from './handle.js'

const getMessages = async (message) => {
    const data = await get(message)
    return data
}

const responseMessages = async (step, message) => {
    const data = await reply(step, message)
    /*if (data && data.media) {
        const file = checkIsUrl(data.media) ? await saveExternalFile(data.media) : data.media;
        return { ...data, ...{ media: file } }
    }*/
    return data
}

const requestApi = async (telefono, opcion) => {
    const data = await request(telefono, opcion)
    console.log(`request: ${data}`);
    return data
}


export { getMessages, responseMessages, requestApi }