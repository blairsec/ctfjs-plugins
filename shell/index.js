module.exports = function (ctf) {
	var express = require('express')
	var node_ssh = require('node-ssh')
	var niceware = require('niceware')
	var passport = ctf.passport
	var User = ctf.models.User
	var Team = ctf.models.Team

	class Shell extends ctf.models.Model {

		static get tableName () {
			return 'shell'
		}

		static get properties () {
			return super.properties.concat([
				{
					name: 'username',
					valid: username => typeof username === 'string'
				},
				{
					name: 'password',
					valid: password => typeof password === 'string'
				},
				{
					name: 'team',
					valid: team => typeof team === 'number'
				}
			])
		}

		constructor (given) {
			super(given)
		}

	}

	// set up router
	var router = express.Router()

	router.get('/team/:id', passport.authenticate('jwt', { session: false }), async function (req, res) {
		req.params.id = parseInt(req.params.id)
		req.user = await User.findOneSerialized({id: req.user.id})
		if (req.user.team.id === req.params.id) {
			var team = await Team.findOne({ competition: req.competition, id: req.params.id })
			if (team) {
				var shell = await Shell.findOne({ team: req.params.id })
				res.json({ username: shell.username, password: shell.password })
			} else {
				res.status(404).json({message: 'team_not_found'})
			}
		} else {
			res.status(403).json({message: 'action_forbidden'})
		}
	})

	// add route to ctf
	ctf.addCompetitionRoute('/shell', router)

	ctf.after('createTeam', async function (req, data) {
		await createAccount(data.team.id)
	})

	// create an account
	async function createAccount(teamId) {
		console.log(teamId)
		var ssh = new node_ssh()
		var password = niceware.generatePassphrase(8).join(' ')
		var shell
		await ssh.connect({
			host: process.env.SHELL_HOST,
			port: process.env.SHELL_PORT,
			username: process.env.SHELL_USERNAME,
			password: process.env.SHELL_PASSWORD
		})
		try {
			await ssh.exec('sudo', ['userdel', '-r', 'team'+teamId])
		} catch (e) {}
		await ssh.exec('sudo', ['useradd', '-m', '-G', 'teams', 'team'+teamId])
		await ssh.exec('sudo', ['chpasswd'], { stdin: 'team'+teamId+':'+password+'\n' })
		await ssh.exec('sudo', ['chmod', '0700', '/home/team'+teamId])
		shell = new Shell({ username: 'team'+teamId, password: password, team: teamId })
		await shell.save()
	}

	// create accounts for teams that don't have them
	async function generatePasswords () {
		var teams = await Team.find({})
		for (var i = 0; i < teams.length; i++) {
			if (!await Shell.findOne({ team: teams[i].id })) {
				await createAccount(teams[i].id)
			}
		}
	}

	generatePasswords()

}