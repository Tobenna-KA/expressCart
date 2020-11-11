/* eslint-disable prefer-arrow-callback, no-var, no-tabs */
$(document).ready(function () {
  // Add specific code to this theme here
  // *** PRODUCT SLIDER ***
  $('#autoWidth').lightSlider({
    autoWidth: true,
    loop: true,
    onSliderLoad: function () {
      $('#autoWidth').removeClass('cS-hidden');
    },
  });

  // *** CAROUSEL ***
  $('.skitter').skitter({
    fullscreen: false,
    theme: 'minimalist',
    navigation: true,
    dots: false,
    label: false,
  });

  // *** PRODUCT CARD ***
  // $('.buy').click(function () {
  //   $('.bottom').addClass('clicked');
  // });

  // $('.remove').click(function () {
  //   $('.bottom').removeClass('clicked');
  // });
});
