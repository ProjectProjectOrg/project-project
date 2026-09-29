Pod::Spec.new do |s|
  s.name           = 'FlowLayout'
  s.version        = '1.0.0'
  s.summary        = 'An Expo UI view that wraps its children onto new lines'
  s.description    = 'An Expo UI view that wraps its children onto new lines'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoUI'

  s.source_files = "**/*.{h,m,swift}"
end
