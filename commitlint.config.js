module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'build', 'chore'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'auth',
        'users',
        'videos',
        'questions',
        'assignments',
        'learning',
        'reports',
        'ui',
        'db',
        'docs',
        'ci',
      ],
    ],
    'subject-case': [0],
  },
};
