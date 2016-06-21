#!/usr/bin/env python

import os
import sys
import time
import hashlib
import flask
from flask import Flask, request, render_template, session
from keystoneclient.auth.identity.v3 import Token
from keystoneclient.session import Session
from keystoneclient.v3.client import Client
import ConfigParser
import logging

config_path = '/etc/reporting-view/reporting-view.conf'
config = ConfigParser.ConfigParser()
if len(config.read(config_path)) == 0:
    sys.exit('Error: could not read config file "{}"'.format(config_path))
auth_url = config.get('server', 'auth_url')
auth_role = config.get('server', 'auth_role')


def get_scoped_token_for_role(role, unscoped_token):
    # get user's projects, using the unscoped token
    auth = Token(auth_url=auth_url, token=unscoped_token)
    session = Session(auth=auth)
    keystone = Client(session=session)
    projects = keystone.projects.list(user=session.get_user_id())

    # get scoped Token for each project, and see that contains our role
    for project in projects:
        scoped_auth = Token(auth_url=auth_url,
                            token=unscoped_token,
                            project_id=project.id)
        scoped_sess = Session(auth=scoped_auth)
        scoped_auth_ref = scoped_auth.get_auth_ref(scoped_sess)
        for scoped_role in scoped_auth_ref['roles']:
            if scoped_role['name'] == role:
                return scoped_auth_ref['auth_token']
    return None


class TimeoutException(Exception):
    """Raised when reading a secret key times out.
    Probably means that another thread has failed in the process of writing
    the secret file.
    """
    pass


def get_secret_key(
    secret_directory='/tmp/reporting-view',
    secret_file='secret.txt',
    timeout=5
):
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
        os.mkdir(secret_directory, 0700)  # raises OSError if it already exists
        # since no OSError was raised, key is being generated for first time
        with open(path, 'w') as f:
            # Flask quickstart suggests 24 random bytes makes an acceptable key
            key = os.urandom(24)
            f.write(key)
            return key
    except OSError:
        # secret_directory exists; assume somebody else is generating key
        for timer in xrange(timeout):
            try:
                with open(path, 'r') as f:
                    return f.read()
            except IOError:
                time.sleep(1)
        raise TimeoutException(
            "Couldn't read {path} after {timeout} seconds.".format(
                path=path,
                timeout=timeout
            )
        )

app = Flask(__name__)
app.secret_key = get_secret_key()


@app.route('/', methods=['GET', 'POST'])
def login():
    token = ""
    auth_exception = auth_failed = False
    if 'token' in request.form and 'tenant_id' in request.form:
        try:
            token = get_scoped_token_for_role(auth_role, request.form['token'])
            if token is None:
                auth_failed = True
        except Exception:
            logging.exception('exception in get_scoped_token_for_role')
            auth_exception = True
    return render_template(
        'login.html',
        token=token,
        auth_failed=auth_failed,
        auth_exception=auth_exception,
        auth_role=auth_role
    )


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
    return  # until rcshib sends back csrf token
    if request.method == "POST":
        token = session.pop('_csrf_token', None)
        if not token or token != request.form.get('_csrf_token'):
            flask.abort(403)


def generate_csrf_token():
    if '_csrf_token' not in session:
        session['_csrf_token'] = hashlib.sha1(os.urandom(64)).hexdigest()
    return session['_csrf_token']

app.jinja_env.globals['csrf_token'] = generate_csrf_token

# mod_wsgi needs this
application = app

if __name__ == '__main__':
    app.run(host='0.0.0.0')
