module.exports = function (ctf) {
	// imports
	var express = require('express')
	var passport = ctf.passport
	var axios = require('axios')

	// home model
	class Instance extends ctf.models.Model {
		static get tableName () {
			return 'instances'
		}

		static get properties () {
			return super.properties.concat([
				{
					name: 'repo',
					valid: repo => typeof repo === 'string'
				},
				{
					name: 'tag',
					valid: tag => typeof tag === 'string'
				},
				{
					name: 'domain',
					valid: domain => typeof domain === 'string'
				},
				{
					name: 'container',
					valid: container => typeof container === 'string'
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

	// config
	const url = process.env.NARWHAL_URL
	const auth = process.env.NARWHAL_AUTH

	router.post('/', [
		body('repo').isString().isLength({ min: 1 }),
		body('tag').isString().isLength({ min: 1 }),
		body('domain').isString().isLength({ min: 1 })
	], passport.authenticate('jwt', { session: false }), async function (req, res) {
		if (req.user.admin !== true) {
			return res.sendStatus(403)
		}
		try {
			var data = {
				repo: req.body.repo,
				tag: req.body.tag,
				environment: {
					VIRTUAL_HOST: req.body.domain
				}
			}
			if (!data.environment.VIRTUAL_HOST) delete data.environment
			var r = await axios.post(url + '/instances', data, { headers: { Authorization: auth } })
			var name = r.data
			var instance = new Instance({
				repo: req.body.repo,
				tag: req.body.tag,
				domain: req.body.domain,
				container: name
			})
			await instance.save()
			res.sendStatus(201)
		} catch (err) {
			console.log(err)
			res.sendStatus(500)
		}
	})

	router.get('/', passport.authenticate('jwt', { session: false }), async function (req, res) {
		if (req.user.admin !== true) {
			return res.sendStatus(403)
		}
		var results = {}
		var instances = await Instance.find({})
		try {
			var r = await axios.get(url + '/instances', { headers: { Authorization: auth } })
			var containers = r.data
		} catch (err) {
			console.log(err)
			return res.sendStatus(500)
		}
		for (var i = 0; i < instances.length; i++) {
			var result = {
				image: instances[i].repo + ':' + instances[i].tag,
				status: 'destroyed',
				domain: instances[i].domain
			}
			if (containers[instances[i].container]) {
				result.status = containers[instances[i].container].status
				result.image = containers[instances[i].container].image
			}
			results[instances[i].container] = result
		}
		res.json(results)
	})

	router.patch('/:name', passport.authenticate('jwt', { session: false }), async function (req, res) {
		if (req.user.admin !== true) {
			return res.sendStatus(403)
		}
		try {
			var r = await axios.get(url + '/instances', { headers: { Authorization: auth } })
			var containers = r.data
		} catch (err) {
			console.log(err)
			return res.sendStatus(500)
		}
		if (!containers[req.params.name]) {
			var i = await Instance.findOne({ container: req.params.name })
			if (!i) return res.sendStatus(404)
			try {
				var r = await axios.post(url + '/instances', {
					repo: i.repo,
					tag: i.tag,
					environment: {
						VIRTUAL_HOST: i.domain
					}
				}, { headers: { Authorization: auth } })
			} catch (err) {
				console.log(err)
				return res.sendStatus(500)
			}
			var name = r.data
			req.params.name = name
			i.container = name
			await i.save()
		}
		try {
			await axios.patch(url + '/instances/' + req.params.name, { action: req.body.action }, { headers: { Authorization: auth } })
		} catch (err) {
			console.log(err)
			return res.sendStatus(500)
		}
		res.sendStatus(204)
	})

	router.delete('/:name', passport.authenticate('jwt', { session: false }), async function (req, res) {
		if (req.user.admin !== true) {
			return res.sendStatus(403)
		}
		try {
			await axios.delete(url + '/instances/' + req.params.name, { headers: { Authorization: auth } })
		} catch (err) {
			console.log(err)
		}
		await Instance.delete({ container: req.params.name })
		res.sendStatus(204)
	})

	// add route to ctf
	ctf.addGlobalRoute('/instances', router)
}
