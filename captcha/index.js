module.exports = function (ctf) {

	var axios = require('axios')

	ctf.before('createUser', async function (req) {
		var r = await axios.post('https://www.google.com/recaptcha/api/siteverify', {}, { params: {
			response: req.headers['captcha'],
			secret: process.env.RECAPTCHA_SECRET
		}})
		if (!r.data.success) throw "Invalid captcha"
	})

}