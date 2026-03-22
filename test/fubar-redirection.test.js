const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const path = require('path');

describe('FUBAR shell script (issue #359)', function() {
  const scriptPath = path.join(__dirname, '../app/fubar/fubar.sh');

  it('should exist', function() {
    expect(fs.existsSync(scriptPath)).to.be.true;
  });

  it('should use overwrite (>) not append (>>) for PROGRESS_FILE redirection', function() {
    const content = fs.readFileSync(scriptPath, 'utf8');
    const lines = content.split('\n');

    // Find lines that execute HyPhy (contain LIBPATH and redirect to PROGRESS_FILE)
    const executionLines = lines.filter(line =>
      line.includes('LIBPATH=') &&
      line.includes('PROGRESS_FILE') &&
      !line.trimStart().startsWith('echo')
    );

    expect(executionLines.length).to.be.greaterThan(0, 'Should find HyPhy execution lines');

    executionLines.forEach(line => {
      // Should use > not >> for PROGRESS_FILE
      expect(line).to.not.match(/>>\s*"\$PROGRESS_FILE"/,
        `Line should not use append (>>) redirection: ${line.trim()}`);
      expect(line).to.match(/>\s*"\$PROGRESS_FILE"/,
        `Line should use overwrite (>) redirection: ${line.trim()}`);
    });
  });

  it('should not have any append redirection to PROGRESS_FILE', function() {
    const content = fs.readFileSync(scriptPath, 'utf8');
    // Check that >> "$PROGRESS_FILE" does not appear anywhere in the script
    expect(content).to.not.include('>> "$PROGRESS_FILE"');
  });
});
