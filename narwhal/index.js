module.exports = function (ctf) {
	// config
	const url = process.env.NARWHAL_URL
	const auth = process.env.NARWHAL_AUTH

	// imports
	var express = require('express')
	var passport = ctf.passport
	var proxy = require('express-http-proxy')

	// set up router
	var router = express.Router()

	router.use(passport.authenticate('jwt', { session: false }), async (req, res, next) => {
		if (req.user.admin) {
			next()
		} else {
			res.status(403).json({message: 'action_forbidden'})
		}
	}, proxy(url, {
		proxyReqOptDecorator: function (proxyReqOpts, srcReq) {
			proxyReqOpts.headers['Authorization'] = auth
			return proxyReqOpts
		}
	}))

	// add route to ctf
	ctf.addGlobalRoute('/narwhal', router)
}
