module.exports = function (ctf) {

	var axios = require('axios')

	ctf.after('verifyEmail', async function (req, data) {
		await axios.post(process.env.MAILTRAIN_URL + '/api/subscribe/' + process.env.MAILTRAIN_LIST + '?access_token=' + process.env.MAILTRAIN_TOKEN, {
			EMAIL: data.user.email,
			FIRST_NAME: data.user.username
		})
	})

}