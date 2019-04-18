module.exports = function (ctf) {

	ctf.before('createUser', async function (req) {
		var r = await axois.post('https://www.google.com/recaptcha/api/siteverify', {
			response: req.headers['captcha'],
			secret: process.env.RECAPTCHA_SECRET
		}
		if (!r.success) throw "Invalid captcha"
	})

}