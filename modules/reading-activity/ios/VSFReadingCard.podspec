Pod::Spec.new do |s|
  s.name           = 'VSFReadingCard'
  s.version        = '1.0.0'
  s.summary        = 'Live Activity for VoiceStudyFlow reading'
  s.description    = 'Starts, updates and ends the reading Live Activity and relays its button actions to JS.'
  s.license        = 'UNLICENSED'
  s.author         = 'VoiceStudyFlow'
  s.homepage       = 'https://voicestudyflow.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = "**/*.{h,m,swift}"
end
