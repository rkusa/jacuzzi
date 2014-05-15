var gulp = require('gulp')

gulp.task('default', ['lint', 'test'], function() {
  // workaround ...
  process.nextTick(function() {
    process.exit(0)
  })
})

var mocha = require('gulp-mocha')
gulp.task('test', function() {
  return gulp.src('test/test.js')
             .pipe(mocha({
               ui: 'tdd',
               reporter: 'spec'
             }))
})

var jshint = require('gulp-jshint')
gulp.task('lint', function() {
  return gulp.src(['lib/*.js', 'test/*.js', 'gulpfile.js'])
             .pipe(jshint())
             .pipe(jshint.reporter('jshint-stylish'))
             .pipe(jshint.reporter('fail'))
})