


const environments={
    development:'http://localhost:3000',
    production:'https://www.easybits.cloud'
}

const baseUrl = environments[process.env.NODE_ENV||'development']

export const config = {
    baseUrl,
    isDev: process.env.NODE_ENV === 'development',
    isProd: process.env.NODE_ENV === 'production'
}
