import os
import shutil
import subprocess
from setuptools import setup, find_packages
from setuptools.command.build_py import build_py

with open('requirements.txt') as f:
    required = f.read().splitlines()

with open('README.md', 'r', encoding='utf-8') as f:
    long_description = f.read()

# Function to read the version from __version__.py
def get_version(rel_path):
    here = os.path.abspath(os.path.dirname(__file__))
    with open(os.path.join(here, rel_path), 'r') as fp:
        for line in fp:
            if line.startswith('__version__'):
                # Executes the line of code and retrieves the __version__ variable
                ns = {}
                exec(line, ns)
                return ns['__version__']
    raise RuntimeError('Unable to find version string.')

# Build and copy the web assets
class CustomBuild(build_py):
    def run(self):
        # First run the standard build process
        super().run()

        # Run the npm build command in the web/ directory
        npm_build_command = "npm run production"
        web_dir_path = os.path.join(os.getcwd(), 'web')
        npm_build_process = subprocess.Popen(npm_build_command, cwd=web_dir_path, shell=True)
        # Ensure the npm build subprocess has finished before continuing
        npm_build_process.wait()
        print("done with npm run production")

        # Directory containing the web assets
        web_assets_src = os.path.join(os.getcwd(), 'web/dist/production')
        # Target directory for the web assets
        web_assets_dest = os.path.join(os.getcwd(), 'build/lib/latentscope/web/dist')

        # Create target directory if it doesn't exist
        os.makedirs(web_assets_dest, exist_ok=True)

        print("copying files", web_assets_src, web_assets_dest)

        # Copy the files
        if os.path.exists(web_assets_src):
            for item in os.listdir(web_assets_src):
                s = os.path.join(web_assets_src, item)
                d = os.path.join(web_assets_dest, item)
                if os.path.isdir(s):
                    print("copytree", s, d)
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    print("copy", s, d)
                    shutil.copy2(s, d)

version = get_version('latentscope/__version__.py')
print("building version", version)
setup(
    name='latentscope',
    version=version,
    description='Quickly embed, project, cluster and explore a dataset.',
    long_description=long_description,
    long_description_content_type='text/markdown',
    url='https://github.com/enjalot/latent-scope',
    project_urls={
        'Source': 'https://github.com/enjalot/latent-scope',
        'Tracker': 'https://github.com/enjalot/latent-scope/issues',
    },
    packages=find_packages(),
    install_requires=required,
    cmdclass={
        'build_py': CustomBuild,
    },
    entry_points={
        'console_scripts': [
            'ls-serve=latentscope.server:start',
            'ls-init=latentscope:main',
            'ls-ingest=latentscope.scripts.ingest:main',
            'ls-list-models=latentscope:list_models',
            'ls-embed=latentscope.scripts.embed:main',
            'ls-embed-debug=latentscope.scripts.embed:debug',
            'ls-embed-truncate=latentscope.scripts.embed:truncate',
            'ls-embed-importer=latentscope.scripts.embed:importer',
            'ls-umap=latentscope.scripts.umapper:main',
            'ls-cluster=latentscope.scripts.cluster:main',
            'ls-label=latentscope.scripts.label_clusters:main',
            'ls-scope=latentscope.scripts.scope:main',
            'ls-export-plot=latentscope.scripts.export_plot:main',
        ],
    },
    include_package_data=True,
    package_data={
        'latentscope': ['web/dist/*', 'web/dist/**/*'],
        'latentscope.models': ['embedding_models.json', 'chat_models.json'],
    },
    # rest of your setup configuration...
)
