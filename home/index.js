module.exports = function (ctf) {
	// imports
	var express = require('express')
	var passport = ctf.passport

	// home model
	class Home extends ctf.models.Model {
		static get tableName () {
			return 'home'
		}

		static get properties () {
			return super.properties.concat([
				{
					name: 'title',
					valid: title => typeof title === 'string'
				},
				{
					name: 'content',
					valid: content => typeof content === 'string'
				}
			])
		}

		constructor (given) {
			super(given)
		}

		static async findOneSerialized (properties) {
			var home = await super.findOneSerialized(properties)
			delete home.id
			delete home.created
			return home
		}
	}
	ctf.models.Home = Home

	// set up router
	var router = express.Router()
	var { body, validationResult } = require('express-validator/check')

	// get home page text
	router.get('/', async (req, res) => {
		await ctf.emitBefore('getHome', req)
		var home = await Home.findOneSerialized({})
		await ctf.emitAfter('getHome', req, { home: home })
		if (home) return res.json(home)
		res.json({title: '', content: ''})
	})

	// set home page
	router.put('/', [
		body('title').isString().isLength({ min: 1 }),
		body('content').isString().isLength({ min: 1 })
	], passport.authenticate('jwt', { session: false }), async (req, res) => {
		if (req.user.admin) {
		  // check if data was valid
		  var errors = validationResult(req)
		  if (!errors.isEmpty()) {
		    return res.status(400).json({message: 'invalid_values'})
		  }
		  await ctf.emitBefore('getHome', req)
		  var home = await Home.findOne({})
		  if (!home) home = await new Home()
		  home.title = req.body.title
		  home.content = req.body.content
		  await ctf.emitAfter('getHome', req, { home: home })
		  home = await home.save()
		  res.sendStatus(204)
		} else {
		  res.status(403).json({message: 'action_forbidden'})
		}
	})

	// add route to ctf
	ctf.addGlobalRoute('/home', router)
}