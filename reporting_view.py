#!/usr/bin/env python

import os
import time
import hashlib
import flask
from flask import Flask, request, render_template, session

class TimeoutException(Exception):
    """Raised when reading a secret key times out.
    Probably means that another thread has failed in the process of writing
    the secret file.
    """
    pass

def get_secret_key(secret_directory='/tmp/reporting_view', secret_file='secret.txt', timeout=5):
    """Load secret key from specified path, if it exists, or randomly generate
    one and save it at the path.

    Keyword arguments:
    secret_directory -- path to directory containing secret key, which will be
                        created if it does not exist
    secret_file -- file within secret_directory containing secret key, which
                   will be created if it does not exist
    timeout -- wait at most this many seconds for secret_file to appear in
               secret_directory; raise TimeoutException on failure
    """
    path = os.path.join(secret_directory, secret_file)
    try:
        os.mkdir(secret_directory, 0700) # raises OSError if directory already exists
        # since no OSError was raised, key is being generated for first time here
        with open(path, 'w') as f:
            key = os.urandom(24) # Flask quickstart suggests 24 random bytes makes an acceptable secret key
            f.write(key)
            return key
    except OSError as e:
        # secret_directory exists; assume somebody else is generating (or has generated) key
        for timer in xrange(timeout):
            try:
                with open(path, 'r') as f:
                    return f.read()
            except IOError:
                # secret file isn't (yet?) readable -- maybe someone else is in the process of creating it...
                time.sleep(1)
        raise TimeoutException("Couldn't read {path} after {timeout} seconds.".format(path=path, timeout=timeout))

app = Flask(__name__)
app.debug = True
app.secret_key = get_secret_key()

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

app.jinja_env.globals['csrf_token'] = generate_csrf_token

# mod_wsgi needs this
application = app

if __name__ == '__main__':
    app.run(host='0.0.0.0')
