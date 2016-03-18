#!/usr/bin/env python

import os
import hashlib
import flask
from flask import Flask, request, render_template

app = Flask(__name__)
app.debug = True

@app.route('/')
def login():
    print(request.form)
    token = ""
    if 'token' in request.form:
        token = request.form['token']
    return render_template('login.html', token=token)

@app.route('/<report>')
def report(report):
    report = '{}.html'.format(report)
    try:
        return render_template(report)
    except flask.templating.TemplateNotFound:
        flask.abort(404)

@app.errorhandler(404)
def page_not_found(error):
    return render_template('404.html'), 404

@app.before_request
def csrf_protect():
    if request.method == "POST":
        token = session.pop('_csrf_token', None)
        if not token or token != request.form.get('_csrf_token'):
            abort(403)

def generate_csrf_token():
    if '_csrf_token' not in session:
        session['_csrf_token'] = hashlib.sha1(os.urandom(64)).hexdigest()
    return session['_csrf_token']

app.jinja_env.globals['csrf_token'] = generate_csrf_token()

# mod_wsgi needs this
application = app

if __name__ == '__main__':
    app.run(host='0.0.0.0')
