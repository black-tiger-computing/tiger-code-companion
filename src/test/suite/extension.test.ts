import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', async () => {
    const extension = vscode.extensions.getExtension('your-name.tiger-code-pilot');
    assert.ok(extension, 'Extension is not installed');
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedCommands = ['codePilot.start', 'codePilot.openChat'];

    for (const cmd of expectedCommands) {
      assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
    }
  });

  test('Should execute codePilot.openChat command', async () => {
    // This test verifies the command can be executed without errors
    try {
      await vscode.commands.executeCommand('codePilot.openChat');
      assert.ok(true, 'Command executed successfully');
    } catch (err) {
      assert.fail(`Failed to execute command: ${err}`);
    }
  });
});
