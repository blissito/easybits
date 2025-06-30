


const environments={
    development:'http://localhost:3000',
    production:'https://www.easybits.cloud'
}

const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000':"https://www.easybits.cloud"

export const config = {
    baseUrl,
    isDev: process.env.NODE_ENV === 'development',
    isProd: process.env.NODE_ENV !== 'development',
    logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
}
