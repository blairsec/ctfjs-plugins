module.exports = function (ctf) {
	// imports
	var express = require('express')
	var { promisify } = require('util')
	var passport = ctf.passport
	var crypto = require('crypto')
	var webdav = require('webdav')
	var multer = require('multer')
	var upload = multer({ storage: multer.memoryStorage(), limits: {
		fileSize: 100 * 1000000 // 100mb
	}})

	class File extends ctf.models.Model {
		static get tableName () {
			return 'files'
		}

		static get properties () {
			return super.properties.concat([
				{
					name: 'path',
					valid: path => typeof path === 'string'
				},
				{
					name: 'challenge',
					valid: challenge => typeof challenge === 'number'
				}
			])
		}

		constructor (given) {
			super(given)
		}
	}

	var client = webdav.createClient(process.env.WEBDAV_URL, {
		username: process.env.WEBDAV_USERNAME,
		password: process.env.WEBDAV_PASSWORD
	})

	// set up router
	var router = express.Router({ mergeParams: true })
	var { body, validationResult } = require('express-validator/check')

	router.use(passport.authenticate('jwt', { session: false }))
	router.use(function (req, res, next) {
		if (req.user.admin !== true) res.sendStatus(403)
		else next()
	})

	// delete file
	router.delete('/:file', async (req, res) => {
		var f = await File.findOne({ challenge: parseInt(req.params.challenge), id: parseInt(req.params.file) })
		if (!f) return res.json({ message: 'file_not_found' })
		try {
			await client.deleteFile(f.path)
			await client.deleteFile(f.path.split('/').slice(0, -1).join('/'))
		} catch {}
		await File.delete({ challenge: parseInt(req.params.challenge), id: parseInt(req.params.file) })
		res.sendStatus(204)
	})

	// get files
	router.get('/', async (req, res) => {
		res.json((await File.find({ challenge: parseInt(req.params.challenge) })).map(f => {return {id: f.id, url: process.env.FILES_URL + f.path}}))
	})

	// upload file
	router.post('/', upload.single('file'), async (req, res) => {
		var c = ctf.models.Challenge.findOne({ competition: req.competition, id: req.params.challenge })
		if (c) {
			var hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex')
			var path = '/' + hash + '/' + req.file.originalname
			var f = new File({ path: path, challenge: parseInt(req.params.challenge) })
			try {
				await client.createDirectory('/' + hash)
				await client.putFileContents(path, req.file.buffer)
				await f.save()
				res.sendStatus(204)
			} catch (e) {
				console.log(e)
				res.sendStatus(500)
			}
		} else {
			res.status(404).json({ message: 'challenge_not_found' })
		}
	})

	ctf.after('getChallenges', async function (req, data) {
		if (!req.user || !req.user.admin) {
			var challenges = data.challenges
			for (var c = 0; c < challenges.length; c++) {
				var files = await File.find({ challenge: challenges[c].id })
				for (var f = 0; f < files.length; f++) {
					challenges[c].description = challenges[c].description.replace(new RegExp('\\[(.*?)\\]\\(' + files[f].path.split('/').slice(-1)[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\)', 'g'), '[$1](' + process.env.FILES_URL + files[f].path + ')')
				}
			}
		}
	})

	ctf.after('getChallenge', async function (req, data) {
		if (!req.user || !req.user.admin) {
			var challenge = data.challenge
			var files = await File.find({ challenge: challenge.id })
			for (var f = 0; f < files.length; f++) {
				challenge.description = challenge.description.replace(new RegExp('\\[(.*?)\\]\\(' + files[f].path.split('/').slice(-1)[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\)', 'g'), '[$1](' + process.env.FILES_URL + files[f].path + ')')
			}
		}
	})

	// add route to ctf
	ctf.addCompetitionRoute('/challenges/:challenge/files', router)
}