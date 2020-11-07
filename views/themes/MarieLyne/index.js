/* eslint-disable prefer-arrow-callback, no-var, no-tabs */
$(document).ready(function () {
  // Add specific code to this theme here
  $('#autoWidth').lightSlider({
    autoWidth: true,
    loop: true,
    onSliderLoad: function () {
      $('#autoWidth').removeClass('cS-hidden');
    },
  });

  $('.skitter').skitter({
    fullscreen: false,
    theme: 'minimalist',
    navigation: true,
    dots: false,
    label: false,
    // responsive: {
    //   responsive: {
    //     small: { animation: 'fade', max_width: 768, suffix: '-small' },
    //     medium: {
    //       animation: 'directionRight',
    //       max_width: 1024,
    //       suffix: '-medium',
    //     },
    //   },
    // },
  });
});
