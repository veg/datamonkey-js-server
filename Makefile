.PHONY: clean all test publish

hyphy:
	echo "installing hyphy"
	@if ! test -d ./.hyphy; then git clone http://github.com/veg/hyphy.git ./.hyphy/; fi
	@cd ./.hyphy && git pull && git checkout 2.3.7 && cmake . && make -j 4 HYPHYMP && cd ../

hivtrace:
	@mkdir -p ./.python
	@virtualenv-3.4 ./.python/env/
	@./.python/env/bin/pip install numpy
	@./.python/env/bin/pip install biopython
	@./.python/env/bin/pip install hivtrace

npm:
	echo "running npm"
	@npm install

directories:
	mkdir -p app/absrel/output
	mkdir -p app/busted/output
	mkdir -p app/fade/output
	mkdir -p app/fel/output
	mkdir -p app/flea/output
	mkdir -p app/fubar/output
	mkdir -p app/gard/output
	mkdir -p app/meme/output
	mkdir -p app/prime/output
	mkdir -p app/relax/output
	mkdir -p app/slac/output

install: hyphy npm directories

