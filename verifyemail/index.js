module.exports = function (ctf) {
  // imports
  var express = require('express')
  var passport = ctf.passport
  var nodemailer = require('nodemailer')
  var aws = require('aws-sdk')
  var crypto = require('crypto')
  var { body, validationResult } = require('express-validator/check')

  // email verification model
  class EmailVerification extends ctf.models.Model {
    static get tableName () {
      return 'email_verification'
    }

    static get properties () {
      return super.properties.concat([
        {
          name: 'token',
          valid: title => typeof title === 'string'
        },
        {
          name: 'used',
          valid: used => typeof used === 'boolean'
        },
        {
          name: 'expiry',
          valid: expiry => expiry instanceof Date
        },
        {
          name: 'user',
          valid: user => typeof user === 'number' && user >= 0
        },
        {
          name: 'email',
          valid: email => typeof email === 'string'
        }
      ])
    }

    constructor (given) {
      super(given)
    }

  }

  // set up email
  var transporter = nodemailer.createTransport({
    SES: new aws.SES({
      apiVersion: '2010-12-01'
    })
  })

  // set up router
  var router = express.Router()
  var { body, validationResult } = require('express-validator/check')

  // send email verification
  async function sendVerificationEmail(email, user, competition) {
    var c = await ctf.models.Competition.findOne({id: competition})
    var h = await ctf.models.Home.findOne({})
    var u = await ctf.models.User.findOne({id: user, competition: c.id})
    if (!u) throw {message: 'user_not_found'}

    var emails = await EmailVerification.find({ user: u.id, used: false })
    for (var r = 0; r < emails.length; r++) {
      if (new Date().getTime() - new Date(emails[r].expiry).getTime() < 0) throw { message: 'email_already_sent' }
    }

    var token = crypto.randomBytes(16).toString('hex')
    var expiry = new Date(new Date().getTime() + 15*60000)
    var reset = await new EmailVerification({ token: token, expiry: expiry, user: u.id, email: email })
    await reset.save()

    var i = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Verify Email for ' + h.title + ' ' + c.name,
      text:
`Hello ${u.username},

You recently signed up for ${h.title} ${c.name}. To confirm your email and activate your account, please visit the following link: ${process.env.VERIFY_URL.replace(/<competition>/g, c.name) + token}

If you did not sign up for this event, you can safely ignore this email. The link is only valid for the next 15 minutes.

- ${h.title} Team`,
      html:
`<div>Hello <code>${u.username.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>,</div>
<div><br></div>
<div>You recently signed up for ${h.title} ${c.name}. To confirm your email and activate your account, please visit the following link: <a href="${process.env.VERIFY_URL.replace(/<competition>/g, c.name) + token}">${process.env.VERIFY_URL.replace(/<competition>/g, c.name) + token}</a></div>
<div><br></div>
<div>If you did not sign up for this event, you can safely ignore this email. The link is only valid for the next 15 minutes.</div>
<div><br></div>
<div>- ${h.title} Team</div>`
    })
    return true
  }

  // verify account
  router.post('/self/verification', [
    body('token').isString()
  ], async (req, res) => {
    // check if data was valid
    var errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({message: 'invalid_values'})
    }
    await ctf.emitBefore('verifyEmail', req)
    
    var verification = await EmailVerification.findOne({ token: req.body.token, used: false })
    if (!verification) return res.status(404).json({message: 'token_not_found'})
    if (new Date().getTime() - new Date(verification.expiry).getTime() >= 0) return res.status(404).json({message: 'token_not_found'})
    verification.used = true
    await verification.save()

    var user = await ctf.models.User.findOne({id: verification.user})
    user.email = verification.email
    await user.save()
    await ctf.emitAfter('verifyEmail', req, { user: user })
    return res.sendStatus(204)
  })

  // check verification status
  router.get('/self/verification', passport.authenticate('jwt', { session: false }), async function (req, res) {
    var pending = await EmailVerification.find({ user: req.user.id, used: false })
    var results = []
    for (var p = 0; p < pending.length; p++) {
      if (new Date().getTime() - new Date(pending[p].expiry).getTime() < 0) results.push({ email: pending[p].email, expiry: pending[p].expiry })
    }
    res.json({ verified: await checkVerified(req), pending: results })
  })

  async function checkVerified (req) {
    var verification = await EmailVerification.findOne({ email: req.user.email, used: true, user: req.user.id })
    if (verification) {
      return true
    }
    return false
  }

  ctf.before('modifyUser', async function (req) {
    var email = req.body.email
    if (email !== req.user.email || !(await checkVerified(req))) {
      req.body.email = req.user.email
      try { await sendVerificationEmail(email, req.user.id, req.competition) }
      catch (e) { console.log(e) }
    }
  })

  ctf.after('createUser', async function (req, data) {
    try { await sendVerificationEmail(data.user.email, data.user.id, req.competition) }
    catch (e) { console.log(e) }
  })

  ctf.before('joinTeam', async function (req) {
    if (!await checkVerified(req)) throw new Error()
  })

  ctf.before('createTeam', async function (req) {
    if (!await checkVerified(req)) throw new Error()
  })

  // add route to ctf
  ctf.addCompetitionRoute('', router)
}
