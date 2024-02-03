import os
import shutil
import subprocess
from setuptools import setup, find_packages
from setuptools.command.build_py import build_py

with open('requirements.txt') as f:
    required = f.read().splitlines()

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

        # Directory containing the web assets
        web_assets_src = os.path.join(os.getcwd(), 'web/dist/production')
        # Target directory for the web assets
        web_assets_dest = os.path.join(os.getcwd(), 'latentscope/web/dist')

        # Create target directory if it doesn't exist
        os.makedirs(web_assets_dest, exist_ok=True)

        # Copy the files
        if os.path.exists(web_assets_src):
            for item in os.listdir(web_assets_src):
                s = os.path.join(web_assets_src, item)
                d = os.path.join(web_assets_dest, item)
                if os.path.isdir(s):
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)

setup(
    name='latentscope',
    version='0.1.0',
    packages=find_packages(),
    install_requires=required,
    cmdclass={
        'build_py': CustomBuild,
    },
    entry_points={
        'console_scripts': [
            'ls-serve=latentscope.server:start',
            'ls-init=latentscope:main',
            'ls-ingest-csv=latentscope.scripts.ingest:csv',
            'ls-list-models=latentscope:list_models',
            'ls-embed=latentscope.scripts.embed:main',
            'ls-umap=latentscope.scripts.umapper:main',
            'ls-cluster=latentscope.scripts.cluster:main',
            'ls-label=latentscope.scripts.label_clusters:main',
        ],
    },
    include_package_data=True,
    package_data={
        'latentscope': ['web/dist/*', 'web/dist/**/*'],
        'latentscope.models': ['embedding_models.json', 'chat_models.json'],
    },
    # rest of your setup configuration...
)
