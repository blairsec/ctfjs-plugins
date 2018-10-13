module.exports = function (ctf) {
	var express = require('express')
	var passport = ctf.passport

	class File extends ctf.models.Model {

		static get tableName () {
			return 'files'
		}

		static get properties () {
			return super.properties.concat([
				{
					name: 'source',
					valid: source => typeof source === 'string'
				},
				{
					name: 'destination',
					valid: destination => typeof destination === 'string'
				}
			])
		}

		constructor (given) {
			super(given)
		}

	}

	// set up router
	var router = express.Router()
	var { body, validationResult } = require('express-validator/check')

	router.get('/*', async (req, res) => {
		var file = await File.findOneSerialized({ source: req.params[0] })
		if (file) return res.redirect(file.destination)
		res.sendStatus(404)
	})

	router.put('/*', passport.authenticate('jwt', { session: false }), async (req, res) => {
		if (req.user.admin) {
			var file = await File.findOne({ source: req.params[0] })
			if (!file) file = new File({ source: req.params[0] })
			file.destination = req.body.destination
			await file.save()
			res.sendStatus(201)
		} else {
		  res.status(403).json({message: 'action_forbidden'})
		}
	})

	// add route to ctf
	ctf.addGlobalRoute('/files', router)
}