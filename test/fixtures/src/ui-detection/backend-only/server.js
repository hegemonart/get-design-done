const fastify = require('fastify')();
fastify.get('/', async () => ({ ok: true }));
module.exports = fastify;
