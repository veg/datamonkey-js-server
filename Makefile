.PHONY: clean all test publish

hyphy:
	echo "installing hyphy"
	@if ! test -d ./.hyphy; then git clone http://github.com/veg/hyphy.git ./.hyphy/; fi
	@cd ./.hyphy && git checkout master && git pull && git checkout 2.3.14 && cmake . && make -j 4 HYPHYMP && make -j 4 HYPHYMPI && cd ../
	@if ! test -d ./.hyphy_gard_version2_3_11; then git clone http://github.com/veg/hyphy.git ./.hyphy_gard_version2_3_11/; fi
	@cd ./.hyphy_gard_version2_3_11 && git checkout master && git pull && git checkout 2.3.11 && cmake . && make -j 4 HYPHYMP && make -j 4 HYPHYMPI && cd ../

hivtrace:
	@mkdir -p ./.python
	@virtualenv ./.python/env/
	@./.python/env/bin/pip install numpy
	@./.python/env/bin/pip install biopython
	@./.python/env/bin/pip install hivtrace==0.3.2

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
	mkdir -p app/hivtrace/output

install: hyphy npm directories

