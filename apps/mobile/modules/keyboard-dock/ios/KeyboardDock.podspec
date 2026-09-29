Pod::Spec.new do |s|
  s.name           = 'KeyboardDock'
  s.version        = '1.0.0'
  s.summary        = 'A view that rides above the keyboard in its own animation'
  s.description    = 'A view that rides above the keyboard in its own animation'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
end
