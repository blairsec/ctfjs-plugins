module.exports = function (ctf) {

	class DiscordAccount extends ctf.models.Model {

		static get tableName () {
			return 'discord_accounts'
		}

		static get properties () {
			return super.properties.concat([
				{
					name: 'user',
					valid: username => typeof username === 'number'
				},
				{
					name: 'discord_id',
					valid: discordId => typeof discordId === 'string'
				}
			])
		}

		constructor (given) {
			super(given)
		}

	}

	var Discord = require('discord.js');
	var client = new Discord.Client();

	var sid = process.env.DISCORD_GUILD_ID

	client.login(process.env.DISCORD_TOKEN);
	client.on('ready', function () {
		client.user.setStatus('available')
	})

	var express = require('express')
	var node_ssh = require('node-ssh')
	var niceware = require('niceware')
	var passport = ctf.passport
	var User = ctf.models.User
	var Team = ctf.models.Team
	var Competition = ctf.models.Competition

	// set up router
	var router = express.Router()

	router.post('/link', passport.authenticate('jwt', { session: false }), async function (req, res) {
		var link = await DiscordAccount.findOne({ user: req.user.id })
		if (!link.discord_id) {
			var tag = req.body.tag
			var user = await client.guilds.get(sid).members.filter(m => m.user.tag == tag) .first()
			if (!user) {
				return res.status(404).json({ message: 'discord_not_found' })
			}
			var competition = await Competition.findOne({ id: parseInt(req.competition) })
			await user.addRole(await client.guilds.get(sid).roles.filter(r => r.name == competition.name) .first())
			link = new DiscordAccount({ user: req.user.id, discord_id: user.user.id })
			await link.save()
			res.sendStatus(200)
		} else {
			res.status(403).json({ message: 'discord_already_linked' })
		}
	})

	router.get('/', passport.authenticate('jwt', { session: false }), async function (req, res) {
		var link = await DiscordAccount.findOne({ user: req.user.id })
		if (!link) return res.status(404).json({message: 'discord_not_linked'})
		var user = await client.fetchUser(link.discord_id)
		res.json({ tag: user.tag, id: link.discord_id })
	})

	// add route to ctf
	ctf.addCompetitionRoute('/discord', router)

}